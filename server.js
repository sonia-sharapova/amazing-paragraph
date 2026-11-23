// The Amazing Paragraph — zero-dependency Node server.
// Run: node server.js   (optional env: PORT, ADMIN_PASSWORD, DATA_DIR)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 4321;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'paragraph';
const PAGE_SIZE = 6;

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[warn] ADMIN_PASSWORD not set — using the dev default "paragraph". Set it before going live.');
}

// ---------- storage ----------
const files = {
  paragraphs: path.join(DATA_DIR, 'paragraphs.json'),
  site: path.join(DATA_DIR, 'site.json'),
  delivery: path.join(DATA_DIR, 'delivery.json'), // written by ap-mail-status (did each email reach its inbox?)
  submissions: path.join(DATA_DIR, 'submissions.json'), // every submission, kept even if the email fails
};
function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJSON(file, data) {
  // atomic write + rolling backup so a bad save never loses content
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  fs.renameSync(tmp, file);
}
const db = {
  site: () => readJSON(files.site),
  all: () => readJSON(files.paragraphs).paragraphs,
  save: (paragraphs) => writeJSON(files.paragraphs, { paragraphs }),
  saveSite: (site) => writeJSON(files.site, site),
  submissions: () => (fs.existsSync(files.submissions) ? readJSON(files.submissions).submissions : []),
  saveSubmissions: (submissions) => writeJSON(files.submissions, { submissions }),
  delivery: () => { try { return readJSON(files.delivery); } catch { return {}; } },
  published() {
    const today = new Date().toISOString().slice(0, 10);
    return this.all()
      .filter((p) => p.status === 'published' && (!p.published || p.published <= today))
      .sort((a, b) => b.number - a.number); // newest first
  },
};

// ---------- formatting ----------
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Minimal inline markup for paragraph text: *italic*, **bold**. Everything else is escaped.
const inline = (s = '') => esc(s)
  .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>');

// Label = per-paragraph override, else the site-wide template.
// Tokens: {n} {n:3} (zero-padded) {issue} {series} {year} {roman}
function roman(n) {
  const m = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of m) while (n >= v) { out += r; n -= v; }
  return out;
}
function label(p, site) {
  if (p.label) return p.label;
  return (site.labelFormat || '{n:3}')
    .replace(/\{n:(\d)\}/g, (_, w) => String(p.number).padStart(Number(w), '0'))
    .replace(/\{n\}/g, p.number)
    .replace(/\{roman\}/g, roman(p.number))
    .replace(/\{issue\}/g, p.issue || '')
    .replace(/\{series\}/g, p.series || '')
    .replace(/\{year\}/g, (p.published || '').slice(0, 4))
    .trim();
}
function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}
function publicView(p, site) {
  return {
    number: p.number, label: label(p, site), title: p.title || '', author: p.author || '',
    html: inline(p.text), published: p.published || '', date: fmtDate(p.published),
    issue: p.issue || '', series: p.series || '', tags: p.tags || [], appearedIn: p.appearedIn || [],
  };
}
const excerpt = (text, words = 22) => {
  const w = String(text).replace(/\*/g, '').split(/\s+/);
  return w.slice(0, words).join(' ') + (w.length > words ? '…' : '');
};

// ---------- templates ----------
function layout({ site, title, page, body, headerExtra = '' }) {
  const today = new Date();
  const nav = [['/', 'Paragraphs', 'home'], ['/archive', 'Archive', 'archive'], ['/about', 'About', 'about']]
    .map(([href, text, key]) => `<a href="${href}"${page === key ? ' aria-current="page"' : ''}>${text}</a>`).join('');
  const pub = db.published();
  const insta = site.instagram ? `https://instagram.com/${esc(site.instagram.replace(/^@/, ''))}` : '';
  return `<!doctype html>
<html lang="en"${site.leadStyle === 'plain' ? '' : ' class="lead-card"'}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${title} — ${site.title}` : site.title)}</title>
<meta name="description" content="${esc(site.tagline)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><text x='2' y='13' font-family='Helvetica' font-size='14'>¶</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@400&display=swap">
<link rel="stylesheet" href="/static/style.css">
</head>
<body class="page-${page}" id="top">
<header class="masthead">
  <a class="wordmark" href="/">${esc(site.title)}</a>
  <span></span>
  <div class="masthead__right">
    <nav>${nav}</nav>${headerExtra}
  </div>
</header>
<main>${body}</main>
<footer class="colophon">
  <span>© ${today.getFullYear()} ${esc(site.title)}</span>
  <span></span>
  <span>${(site.inquiriesEmail || site.email) ? `<a href="mailto:${esc(site.inquiriesEmail || site.email)}">Email</a>` : ''}${insta ? `<a href="${insta}" rel="noopener">Instagram</a>` : ''}<a class="editor-link" href="/admin">Editor login</a></span>
</footer>
</body>
</html>`;
}

function paragraphBlock(v, { lead = false, kicker = '' } = {}) {
  return `<article class="para${lead ? ' para--lead' : ''}" id="p${v.number}" data-number="${v.number}">
  ${kicker ? `<p class="stream__kicker stream__kicker--lead">${esc(kicker)}</p>` : ''}
  <div class="para__meta">
    <a class="para__label" href="/p/${v.number}">${esc(v.label)}</a>
    <span class="para__date">${esc(v.date)}</span>
  </div>
  <div class="para__body">
    ${v.title ? `<h2 class="para__title">${esc(v.title)}</h2>` : ''}
    <p class="para__text">${v.html}</p>
    <p class="para__byline">${v.author ? esc(v.author) : ''}${v.issue ? `<span>${esc(v.issue)}</span>` : ''}</p>
  </div>
</article>`;
}

function homePage(site) {
  const all = db.published();
  const views = all.map((p) => publicView(p, site));
  const first = views.slice(0, PAGE_SIZE);
  const index = views.map((v) => `<li><a href="#p${v.number}" data-number="${v.number}"><span>${esc(v.label)}</span><span>${esc(v.author || v.title)}</span></a></li>`).join('');
  const body = `
<section class="stream" data-total="${views.length}" data-page-size="${PAGE_SIZE}">
  ${first.length ? `${paragraphBlock(first[0], { lead: true, kicker: 'Latest' })}
  ${first.length > 1 ? '<p class="stream__kicker stream__kicker--rule">Previously</p>' : ''}
  ${first.slice(1).map((v) => paragraphBlock(v)).join('')}` : '<p class="empty">No paragraphs yet.</p>'}
  <div class="stream__sentinel" aria-hidden="true"></div>
  <p class="stream__end" hidden>That is every paragraph. <a href="/archive">See the archive</a>.</p>
</section>
<script src="/static/stream.js" defer></script>`;
  // the running index hangs from the header nav, so both stay together
  const headerExtra = views.length ? `\n    <aside class="index" aria-label="Index of paragraphs"><ol>${index}</ol></aside>` : '';
  return layout({ site, page: 'home', body, headerExtra });
}

function archivePage(site) {
  const views = db.published().map((p) => publicView(p, site));
  const all = db.published();
  const issues = [...new Set(views.map((v) => v.issue).filter(Boolean))];
  const tags = [...new Set(views.flatMap((v) => v.tags))].sort();
  const cells = views.map((v, i) => `<a class="cell" href="/p/${v.number}" data-issue="${esc(v.issue)}" data-tags="${esc(v.tags.join('|'))}" data-number="${v.number}">
    <span class="cell__label">${esc(v.label)}</span>
    <span class="cell__title">${esc(v.title || excerpt(all[i].text, 9))}</span>
    <span class="cell__excerpt">${v.title ? esc(excerpt(all[i].text)) : ''}</span>
    <span class="cell__foot"><span>${esc(v.author)}</span><span>${esc(v.date)}</span></span>
  </a>`).join('');
  const body = `
<section class="archive">
  <div class="archive__bar">
    <h1>Archive <span>${views.length}</span></h1>
    <div class="archive__controls">
      ${issues.length ? `<label>Issue <select data-filter="issue"><option value="">All</option>${issues.map((i) => `<option>${esc(i)}</option>`).join('')}</select></label>` : ''}
      ${tags.length ? `<label>Tag <select data-filter="tag"><option value="">All</option>${tags.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>` : ''}
      <label>Order <select data-sort><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label>
      <span class="toggle" role="group" aria-label="View"><button type="button" data-view="grid" aria-pressed="true">Grid</button><button type="button" data-view="list" aria-pressed="false">Index</button></span>
    </div>
  </div>
  <div class="grid">${cells}</div>
  <div class="toc" hidden>${tocGroups(views, all)}</div>
</section>
<script src="/static/archive.js" defer></script>`;
  return layout({ site, title: 'Archive', page: 'archive', body, count: views.length });
}

// Index view: paragraphs grouped by issue, like a printed contents page.
// Groups are numbered in publication order (01 = first issue); hovering a row opens the full paragraph.
function tocGroups(views, all) {
  const groups = new Map();
  views.forEach((v, i) => {
    const key = v.issue || 'Unfiled';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ v, text: all[i].text });
  });
  const chrono = [...groups.keys()].sort((a, b) => Math.min(...groups.get(a).map((x) => x.v.number)) - Math.min(...groups.get(b).map((x) => x.v.number)));
  return [...groups.entries()].map(([name, rows]) => `
  <section class="toc__group" data-issue="${esc(name === 'Unfiled' ? '' : name)}" data-order="${chrono.indexOf(name)}">
    <h2 class="toc__head"><span>${String(chrono.indexOf(name) + 1).padStart(2, '0')}</span><span>${esc(name)}</span></h2>
    <ol class="toc__rows">${rows.map(({ v, text }) => `
      <li class="toc__row" data-number="${v.number}" data-tags="${esc(v.tags.join('|'))}">
        <a href="/p/${v.number}" class="toc__line">
          <span class="toc__num">${esc(v.label)} /</span>
          <span class="toc__title">${esc(v.title || excerpt(text, 6))}${v.author ? `<span class="toc__author"> — ${esc(v.author)}</span>` : ''}</span>
          <span class="toc__date">${esc(v.date)}</span>
        </a>
        <div class="toc__full"><div><p>${inline(text)}</p></div></div>
      </li>`).join('')}
    </ol>
  </section>`).join('');
}

// state: { sent, receipt } after a successful submission, or { error, values } to re-show the form with a message.
function aboutPage(site, state) {
  const paras = String(site.about || '').split(/\n\s*\n/).map((t) => `<p>${inline(t.trim())}</p>`).join('');
  const pub = db.published(); // newest first
  // contributors grouped by issue (newest issue first), each name once per issue
  const byIssue = new Map();
  pub.forEach((p) => {
    if (!p.author) return;
    const k = p.issue || 'Other';
    if (!byIssue.has(k)) byIssue.set(k, new Set());
    byIssue.get(k).add(p.author);
  });
  const contributors = [...byIssue.entries()].map(([issue, names]) =>
    `<div class="about__issue"><h3>${esc(issue)}</h3><ul>${[...names].sort((a, b) => a.localeCompare(b)).map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`).join('');
  const insta = site.instagram ? `https://instagram.com/${esc(site.instagram.replace(/^@/, ''))}` : '';
  const sent = !!(state && state.sent);
  const receipt = state && state.receipt && state.receipt.exp > Date.now() ? state.receipt : null;
  const err = state && state.error ? state.error : '';
  const v = (state && state.values) || {};
  const body = `
<section class="about">
  <div class="about__hero">
    <div class="about__side">
      ${site.aboutImage ? `<figure class="about__figure"><img src="${esc(site.aboutImage)}" alt=""></figure>` : ''}
      ${contributors ? `<div class="about__contributors"><h2>Contributors</h2>${contributors}</div>` : ''}
    </div>
    <div class="about__main">
      <h1>About ${esc(site.title)}</h1>
      <div class="about__block"><h2>The magazine</h2>${paras}</div>
      <div class="about__block" id="submit">
        <h2>Submissions</h2>
        ${site.submissions ? `<p>${inline(site.submissions)}</p>` : ''}
        <!-- submission form: saved to data/submissions.json, shown in the editor, emailed to SUBMISSIONS_TO via Postfix -->
        ${sent ? `
        <div class="form-note" role="status">
          <p>Thank you${receipt && receipt.name ? `, ${esc(receipt.name)}` : ''} — your paragraph has been received.</p>
          ${receipt ? `<figure class="receipt">
            <figcaption>What you sent</figcaption>
            ${receipt.title ? `<p class="receipt__title">${esc(receipt.title)}</p>` : ''}
            <p class="receipt__text">${inline(receipt.text)}</p>
            ${receipt.name ? `<p class="receipt__by">${esc(receipt.name)}</p>` : '<p class="receipt__by">Anonymous</p>'}
          </figure>` : ''}
          ${receipt && receipt.email ? `<p class="form-spam-note">We’ve sent a confirmation to <strong>${esc(receipt.email)}</strong>. If it hasn’t arrived in a few minutes, please check your spam or junk folder — and mark it “not spam” so our replies reach you.</p>` : ''}
          <a class="form-again" href="/about#submit">Submit another paragraph</a>
        </div>
        <script>/* reloading should show a fresh form, not the thank-you */ history.replaceState(null, '', '/about#submit');</script>` : `
        <form class="submit-form${v.anonymous ? ' is-anonymous' : ''}" method="post" action="/submit" novalidate>
          <label class="check"><input type="checkbox" name="anonymous" value="1"${v.anonymous ? ' checked' : ''}> Submit anonymously</label>
          <p class="anon-note">Your name won’t be printed. An email is optional — leave one only if you’d like us to be able to reply.</p>
          <div class="row">
            <label class="name-field">Name, as it should be printed <input name="name" maxlength="120" autocomplete="name" value="${esc(v.name || '')}"></label>
            <label>Email <span class="opt">(optional)</span> <input name="email" type="email" maxlength="200" autocomplete="email" value="${esc(v.email || '')}"></label>
          </div>
          <label>Title <span class="opt-always">(optional)</span> <input name="title" maxlength="200" value="${esc(v.title || '')}"></label>
          <label>Your paragraph <textarea name="text" rows="9" maxlength="8000" aria-describedby="format-hint">${esc(v.text || '')}</textarea></label>
          <p class="form-hint" id="format-hint">One paragraph only. For <em>italics</em> put asterisks around the words: <code>*like this*</code>. For <strong>bold</strong> use two: <code>**like this**</code>.</p>
          <label class="hp" aria-hidden="true">Leave empty <input name="website" tabindex="-1" autocomplete="off"></label>
          ${err ? `<p class="error" role="alert">${esc(err)}</p>` : ''}
          <div><button type="submit">Submit paragraph</button></div>
        </form>
        <script>/* anonymous toggle: hide the name, make email optional */
          (function(){var f=document.querySelector('.submit-form'),c=f&&f.querySelector('[name=anonymous]');
          if(c)c.addEventListener('change',function(){f.classList.toggle('is-anonymous',c.checked)});})();
        </script>`}
      </div>
      <div class="about__block">
        <h2>Contact</h2>
        <dl class="about__contact">
          ${site.inquiriesEmail ? `<div><dt>General inquiries</dt><dd><a href="mailto:${esc(site.inquiriesEmail)}">${esc(site.inquiriesEmail)}</a></dd></div>` : ''}
          ${site.email ? `<div><dt>Submissions &amp; editors</dt><dd><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></dd></div>` : ''}
          ${insta ? `<div><dt>Instagram</dt><dd><a href="${insta}" rel="noopener">${esc(site.instagram)}</a></dd></div>` : ''}
        </dl>
      </div>
    </div>
  </div>
</section>`;
  return layout({ site, title: 'About', page: 'about', body });
}

function singlePage(site, number) {
  const all = db.published();
  const i = all.findIndex((p) => p.number === number);
  if (i === -1) return null;
  const v = publicView(all[i], site);
  const newer = all[i - 1], older = all[i + 1];
  const arrow = (p, dir, text) => p
    ? `<a class="arrows__btn" href="/p/${p.number}" data-key="${dir}" aria-label="${dir === 'prev' ? 'Previous' : 'Next'}: ${esc(label(p, site))}">${text}</a>`
    : `<span class="arrows__btn is-off" aria-hidden="true">${text}</span>`;
  const body = `
<section class="single">
  <nav class="arrows" aria-label="Browse paragraphs">${arrow(older, 'prev', '←')}${arrow(newer, 'next', '→')}</nav>
  <script>addEventListener('keydown',function(e){if(e.target.closest('input,textarea,select'))return;var k=e.key==='ArrowLeft'?'prev':e.key==='ArrowRight'?'next':null;var a=k&&document.querySelector('[data-key="'+k+'"]');if(a)location.href=a.href})</script>
  ${paragraphBlock(v, { lead: true })}
  <nav class="single__nav">
    <span>${older ? `<a href="/p/${older.number}">← ${esc(label(older, site))}</a>` : ''}</span>
    <a href="/archive">Archive</a>
    <span>${newer ? `<a href="/p/${newer.number}">${esc(label(newer, site))} →</a>` : ''}</span>
  </nav>
</section>`;
  return layout({ site, title: v.title || v.label, page: 'single', body });
}

const ICON_DOWNLOAD = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m-3.5-3.5L8 10l3.5-3.5M2.5 13.5h11" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
const ICON_SHEET = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h11v11h-11zM2.5 6.2h11M2.5 9.8h11M6.2 2.5v11" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
function adminPage(site, loggedIn, error) {
  if (!loggedIn) {
    return layout({ site, title: 'Editor', page: 'admin', body: `
<section class="login">
  <h1>Editor login</h1>
  <form method="post" action="/admin/login">
    <label>Password <input type="password" name="password" autocomplete="current-password" autofocus required></label>
    ${error ? `<p class="error">${esc(error)}</p>` : ''}
    <button type="submit">Enter</button>
  </form>
</section>` });
  }
  return layout({ site, title: 'Editor', page: 'admin', body: `
<section class="admin" id="admin">
  <div class="admin__bar">
    <h1>Editor</h1>
    <div>
      <details class="dl">
        <summary class="btn">${ICON_DOWNLOAD}<span>Download</span></summary>
        <div class="dl__menu">
          <a href="/admin/export.json" download>${ICON_DOWNLOAD}<span>Full backup <em>.json</em></span></a>
          <a href="/admin/paragraphs.csv" download>${ICON_SHEET}<span>Paragraphs <em>spreadsheet .csv</em></span></a>
          <a href="/admin/submissions.csv" download>${ICON_SHEET}<span>Submissions <em>spreadsheet .csv</em></span></a>
        </div>
      </details>
      <form method="post" action="/admin/logout" class="inline"><button type="submit">Log out</button></form>
    </div>
  </div>
  <div class="admin__cols">
    <div class="admin__list">
      <button type="button" class="primary" data-action="new">+ New paragraph</button>
      <ol data-list></ol>
    </div>
    <form class="admin__form" data-form autocomplete="off"></form>
  </div>
  <details class="admin__site" data-submissions-panel>
    <summary>Submissions <span data-sub-count></span></summary>
    <ol class="subs" data-subs></ol>
  </details>
  <details class="admin__site">
    <summary>Site settings &amp; About page</summary>
    <form data-site-form></form>
  </details>
</section>
<script src="/static/admin.js" defer></script>` });
}

// ---------- submission email (via the server's own Postfix: /usr/sbin/sendmail) ----------
// Off unless SUBMISSIONS_TO is set (so local previews never send mail).
// env: SUBMISSIONS_TO (e.g. editors@amazingparagraph.com),
//      MAIL_FROM (default "The Amazing Paragraph <submissions@amazingparagraph.com>")
const { fmtReceived, oneLine, encodeHeader, sendmail } = require('./lib/mail');
const { toCSV, submissionColumns, paragraphColumns } = require('./lib/csv');
function markSubmission(id, fields) {
  try {
    db.saveSubmissions(db.submissions().map((x) => (x.id === id ? { ...x, ...fields } : x)));
  } catch (e) { console.error('[submissions] could not record mail status:', e.message); }
}
// Failure notices go to bounces@ (discarded); ap-mail-status reads the outcome from the mail log instead.
const editorsMessageId = (id, attempt) => (attempt > 1 ? `<${id}.r${attempt}@amazingparagraph.com>` : `<${id}@amazingparagraph.com>`);
const RETURN_PATH = process.env.MAIL_RETURN_PATH || 'bounces@amazingparagraph.com';
async function notifySubmission(sub, attempt = 1) {
  const to = oneLine(process.env.SUBMISSIONS_TO);
  if (!to) return markSubmission(sub.id, { emailed: false, emailError: 'SUBMISSIONS_TO not set' });
  const from = oneLine(process.env.MAIL_FROM) || 'The Amazing Paragraph <submissions@amazingparagraph.com>';
  const fromAddr = (from.match(/<([^>]+)>/) || [, from])[1];
  const name = oneLine(sub.name), email = oneLine(sub.email), title = oneLine(sub.title);
  const body = [
    'New submission to The Amazing Paragraph',
    '',
    `Name:     ${sub.anonymous ? 'Anonymous (submitted anonymously)' : name}`,
    `Email:    ${email || '— not given'}`,
    title ? `Title:    ${title}` : null,
    `Received: ${fmtReceived(sub.received)}`,
    '',
    sub.text,
    '',
    email
      ? `— Replying to this email goes straight to ${sub.anonymous ? 'the (anonymous) author' : name} at ${email}. It is also saved in the editor under Submissions.`
      : '— No email was given, so this author can’t be replied to. It is also saved in the editor under Submissions.',
  ].filter((l) => l !== null).join('\n');
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    ...(email ? [`Reply-To: ${encodeHeader(name.replace(/["<>]/g, ''))} <${email}>`] : []),
    `Subject: ${encodeHeader(`New paragraph: ${title || 'Untitled'} — ${name}`.slice(0, 200))}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: ${editorsMessageId(sub.id, attempt)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
    '',
  ].join('\r\n');
  try {
    await sendmail(message, RETURN_PATH);
    markSubmission(sub.id, { emailed: true, emailedAt: new Date().toISOString(), emailAttempts: attempt, editorsMessageId: editorsMessageId(sub.id, attempt), emailError: undefined });
  } catch (e) {
    console.error('[submissions] email failed:', e.message);
    markSubmission(sub.id, { emailed: false, emailError: e.message.slice(0, 300) });
  }
}

// ---------- automatic "thank you" to the submitter ----------
// Text comes from Site settings → "Auto-reply" ({name} is replaced; empty text = off).
// Guard rails, since anyone can type any address into the form: one per address per hour,
// 300 a day overall, a greeting name that can't carry links, and links in the copy made unclickable.
const DEFAULT_AUTO_REPLY = `Hello {name},

Thank you for submitting your paragraph! We will review your submission and let you know when it has been reviewed.

Best,
The Amazing Paragraph
admin@amazingparagraph.com`;
const autoReplied = new Map(); // address -> last sent
let autoReplyDay = '', autoReplyCount = 0;
async function autoReply(sub, site) {
  const template = site.autoReply === undefined ? DEFAULT_AUTO_REPLY : String(site.autoReply);
  const to = oneLine(sub.email).toLowerCase();
  if (!to || !template.trim() || !process.env.SUBMISSIONS_TO) return; // no address / switched off / mail not set up
  const today = new Date().toISOString().slice(0, 10);
  if (today !== autoReplyDay) { autoReplyDay = today; autoReplyCount = 0; }
  if (Date.now() - (autoReplied.get(to) || 0) < 3600e3 || autoReplyCount >= 300) {
    return markSubmission(sub.id, { autoReplied: false, autoReplyNote: 'skipped (rate limit)' });
  }
  autoReplied.set(to, Date.now()); autoReplyCount += 1;
  const rawName = sub.anonymous ? '' : oneLine(sub.name);
  const safeName = /https?:|www\.|@|\.[a-z]{2,}\//i.test(rawName) ? '' : rawName.slice(0, 60);
  const text = template.replace(/\r\n/g, '\n')
    .replace(/[ \t]*\{name\}/g, safeName ? ` ${safeName}` : '') // "Hello {name}," → "Hello," when there's no name
    .replace(/Hello ,/g, 'Hello,');
  // A copy of what they sent. Links are written so mail apps won't make them clickable, so the
  // form can't be used to send working links to someone else's inbox from this domain.
  const defang = (t) => String(t || '').replace(/\b(https?):\/\//gi, '$1[:]//').replace(/\bwww\./gi, 'www[.]');
  const copy = [
    '',
    '',
    '———',
    'A copy of your submission',
    '',
    sub.title ? `Title:    ${defang(oneLine(sub.title))}` : null,
    `Received: ${fmtReceived(sub.received)}`,
    '',
    defang(sub.text),
  ].filter((l) => l !== null).join('\n');
  const from = oneLine(site.inquiriesEmail) || 'admin@amazingparagraph.com';
  const message = [
    `From: The Amazing Paragraph <${from}>`,
    `To: ${to}`,
    `Reply-To: ${from}`,
    `Subject: ${encodeHeader('Thank you for your submission — The Amazing Paragraph')}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <thanks-${sub.id}@amazingparagraph.com>`,
    'Auto-Submitted: auto-replied', // RFC 3834: tells mail systems not to auto-reply back
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text + copy,
    '',
  ].join('\r\n');
  try {
    await sendmail(message, RETURN_PATH);
    markSubmission(sub.id, { autoReplied: true, thanksMessageId: `<thanks-${sub.id}@amazingparagraph.com>` });
  } catch (e) {
    console.error('[submissions] auto-reply failed:', e.message);
    markSubmission(sub.id, { autoReplied: false, autoReplyNote: e.message.slice(0, 200) });
  }
}

// Is this an address mail can be delivered to? Checks the format, then that the domain has
// mail servers (MX) or at least an address. DNS hiccups don't block a submission.
const dns = require('dns').promises;
async function checkEmail(email) {
  if (!/^[^@\s"<>,;]+@[^@\s"<>,;]+\.[a-z]{2,}$/i.test(email)) return 'That email address doesn’t look right — please check it.';
  const domain = email.split('@')[1].toLowerCase();
  const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), 4000))]);
  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    if (mx.length && !(mx.length === 1 && mx[0].exchange === '')) return null; // "." null MX = accepts no mail
    return `${domain} doesn’t accept email — please check the address.`;
  } catch (e) {
    if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') {
      try { await withTimeout(dns.resolve4(domain)); return null; } catch { /* fall through */ }
      return `We couldn’t find ${domain} — please check the email address.`;
    }
    return null; // DNS trouble on our side: don't punish the submitter
  }
}

// ---------- auth ----------
// Logins are signed tokens ("expiry.signature"), so they survive server restarts and deploys.
// The signing secret lives in DATA_DIR/.session-secret (created on first run, never deployed).
const SESSION_SECRET = (() => {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(DATA_DIR, '.session-secret');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch { /* create below */ }
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s + '\n', { mode: 0o600 });
  return s;
})();
const signSession = (exp) => `${exp}.${crypto.createHmac('sha256', SESSION_SECRET).update(String(exp)).digest('hex')}`;
const submitTimes = new Map(); // ip -> last submission
const receipts = new Map(); // token -> { name, title, text, exp } shown once on the thank-you page
const attempts = new Map(); // ip -> { n, until }
const SESSION_MS = 1000 * 60 * 60 * 12;
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }));
}
function isAuthed(req) {
  const t = parseCookies(req).ap_session || '';
  const exp = Number(t.split('.')[0]);
  if (!exp || exp < Date.now()) return false;
  const good = Buffer.from(signSession(exp)), got = Buffer.from(t);
  return good.length === got.length && crypto.timingSafeEqual(good, got);
}
function checkPassword(pw) {
  const a = crypto.createHash('sha256').update(String(pw)).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------- http helpers ----------
function send(res, status, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}
const json = (res, status, data, headers) => send(res, status, JSON.stringify(data), 'application/json; charset=utf-8', headers);
function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > limit) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
function serveStatic(res, rel) {
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream', { 'Cache-Control': 'no-cache' });
}

// ---------- paragraph validation ----------
function clean(input, existing) {
  const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => str(s, 60)).filter(Boolean);
  const out = {
    ...existing,
    label: str(input.label, 60),
    title: str(input.title),
    author: str(input.author),
    text: String(input.text ?? '').replace(/\s*\n+\s*/g, ' ').trim().slice(0, 8000), // one paragraph only
    published: /^\d{4}-\d{2}-\d{2}$/.test(input.published) ? input.published : new Date().toISOString().slice(0, 10),
    issue: str(input.issue, 80),
    series: str(input.series, 80),
    tags: list(input.tags),
    appearedIn: list(input.appearedIn),
    status: input.status === 'draft' ? 'draft' : 'published',
    notes: str(input.notes, 2000),
  };
  if (Number.isInteger(Number(input.number)) && Number(input.number) > 0) out.number = Number(input.number);
  if (!out.text) throw new Error('The paragraph text is empty.');
  return out;
}

// ---------- router ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  let site;
  try {
    site = db.site();
  } catch (err) {
    // A hand edit broke data/site.json: explain instead of crashing the whole server.
    console.error('[data/site.json]', err.message);
    return send(res, 500, `data/site.json could not be read: ${esc(err.message)}. Fix the file (or restore data/site.json.bak) and reload.`, 'text/plain; charset=utf-8');
  }
  try {
    if (p.startsWith('/static/')) return serveStatic(res, p.slice(8));
    if (req.method === 'GET' && p === '/') return send(res, 200, homePage(site));
    if (req.method === 'GET' && p === '/archive') return send(res, 200, archivePage(site));
    if (req.method === 'GET' && p === '/about') return send(res, 200, aboutPage(site, url.searchParams.get('sent') ? { sent: true, receipt: receipts.get(url.searchParams.get('sent')) } : null));

    // public submission form
    if (req.method === 'POST' && p === '/submit') {
      // Behind Caddy every request comes from 127.0.0.1, so use the forwarded client address.
      const ip = (req.socket.remoteAddress === '127.0.0.1' || req.socket.remoteAddress === '::1')
        ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress
        : req.socket.remoteAddress;
      const f = new URLSearchParams(await readBody(req, 64e3));
      if (f.get('website')) return send(res, 303, '', 'text/plain', { Location: '/about?sent=1#submit' }); // honeypot
      const anonymous = f.get('anonymous') === '1';
      const values = {
        anonymous,
        name: (f.get('name') || '').trim().slice(0, 120),
        email: (f.get('email') || '').trim().slice(0, 200),
        title: (f.get('title') || '').trim().slice(0, 200),
        text: (f.get('text') || '').replace(/\s*\n+\s*/g, ' ').trim().slice(0, 8000),
      };
      // On a problem, re-show the form with what they typed and a specific message (nothing is lost).
      const fail = (msg) => send(res, 400, aboutPage(site, { error: msg, values }));
      if (!values.text) return fail('Please paste your paragraph.');
      if (!anonymous && !values.name) return fail('Please add your name as it should be printed, or tick “Submit anonymously”.');
      if (!anonymous && !values.email) return fail('Please add your email so we can reply, or tick “Submit anonymously”.');
      if (values.email) {
        const check = await checkEmail(values.email);
        if (check) return fail(check);
      }
      const wait = 15e3 - (Date.now() - (submitTimes.get(ip) || 0));
      if (wait > 0) return fail(`You just sent one — please wait ${Math.ceil(wait / 1000)} seconds before submitting another.`);
      const sub = {
        id: crypto.randomUUID(),
        anonymous,
        name: anonymous ? 'Anonymous' : values.name,
        email: values.email,
        title: values.title,
        text: values.text,
        received: new Date().toISOString(),
      };
      submitTimes.set(ip, Date.now());
      db.saveSubmissions([sub, ...db.submissions()]); // stored first, so a mail failure never loses it
      notifySubmission(sub);
      autoReply(sub, site);
      // a private, short-lived receipt so the thank-you page can show what they sent
      const now = Date.now();
      for (const [k, r] of receipts) if (r.exp < now) receipts.delete(k);
      const token = crypto.randomBytes(16).toString('hex');
      const confirming = !!values.email && !!process.env.SUBMISSIONS_TO && (site.autoReply === undefined || String(site.autoReply).trim() !== '');
      receipts.set(token, { name: anonymous ? '' : values.name, title: values.title, text: values.text, email: confirming ? values.email : '', exp: now + 15 * 60e3 });
      return send(res, 303, '', 'text/plain', { Location: `/about?sent=${token}#submit` }); // redirect so reload never re-sends
    }
    const m = p.match(/^\/p\/(\d+)$/);
    if (req.method === 'GET' && m) {
      const html = singlePage(site, Number(m[1]));
      return html ? send(res, 200, html) : send(res, 404, layout({ site, page: '404', body: '<p class="empty">No such paragraph.</p>' }));
    }
    if (req.method === 'GET' && p === '/api/paragraphs') {
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const limit = Math.min(24, Math.max(1, Number(url.searchParams.get('limit')) || PAGE_SIZE));
      const all = db.published();
      return json(res, 200, { total: all.length, items: all.slice(offset, offset + limit).map((x) => publicView(x, site)) });
    }

    // --- admin ---
    if (p === '/admin' && req.method === 'GET') return send(res, 200, adminPage(site, isAuthed(req)), undefined, { 'Cache-Control': 'no-store' });
    if (p === '/admin/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress;
      const a = attempts.get(ip) || { n: 0, until: 0 };
      if (a.until > Date.now()) return send(res, 429, adminPage(site, false, 'Too many attempts. Try again in a few minutes.'));
      const pw = new URLSearchParams(await readBody(req)).get('password') || '';
      if (!checkPassword(pw)) {
        a.n += 1; if (a.n >= 5) { a.until = Date.now() + 5 * 60 * 1000; a.n = 0; }
        attempts.set(ip, a);
        return send(res, 401, adminPage(site, false, 'Wrong password.'));
      }
      attempts.delete(ip);
      const token = signSession(Date.now() + SESSION_MS);
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      return send(res, 303, '', 'text/plain', { Location: '/admin', 'Set-Cookie': `ap_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}` });
    }
    if (p === '/admin/logout' && req.method === 'POST') {
      return send(res, 303, '', 'text/plain', { Location: '/about', 'Set-Cookie': 'ap_session=; Path=/; Max-Age=0' });
    }
    if (p.startsWith('/admin/') || p.startsWith('/api/admin/')) {
      if (!isAuthed(req)) {
        // a link/download (not the editor's own API calls) goes back to the login page instead of an error
        if (req.method === 'GET' && !p.startsWith('/api/')) return send(res, 303, '', 'text/plain', { Location: '/admin' });
        return json(res, 401, { error: 'Not logged in' });
      }
      // writes must be JSON (blocks plain cross-site form posts)
      if (req.method !== 'GET' && !(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'JSON required' });
    }
    if (p === '/admin/paragraphs.csv' || p === '/admin/submissions.csv') {
      const today = new Date().toISOString().slice(0, 10);
      const isSubs = p === '/admin/submissions.csv';
      const csv = isSubs
        ? toCSV(db.submissions(), submissionColumns(fmtReceived))
        : toCSV(db.all().sort((a, b) => b.number - a.number), paragraphColumns((x) => label(x, site)));
      return send(res, 200, csv, 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="amazing-paragraph-${isSubs ? 'submissions' : 'paragraphs'}-${today}.csv"`, 'Cache-Control': 'no-store' });
    }
    if (p === '/admin/export.json') {
      return send(res, 200, JSON.stringify({ site, paragraphs: db.all(), submissions: db.submissions() }, null, 2), 'application/json', { 'Content-Disposition': `attachment; filename="amazing-paragraph-backup-${new Date().toISOString().slice(0, 10)}.json"` });
    }
    if (p === '/api/admin/data' && req.method === 'GET') {
      const all = db.all().sort((a, b) => b.number - a.number);
      return json(res, 200, { site, paragraphs: all.map((x) => ({ ...x, displayLabel: label(x, site) })) });
    }
    if (p === '/api/admin/paragraphs' && req.method === 'POST') {
      const all = db.all();
      const next = all.reduce((mx, x) => Math.max(mx, x.number), 0) + 1;
      const item = clean(JSON.parse(await readBody(req)), { id: crypto.randomUUID(), number: next, created: new Date().toISOString() });
      if (all.some((x) => x.number === item.number)) throw new Error(`Number ${item.number} is already used.`);
      all.push(item); db.save(all);
      return json(res, 201, item);
    }
    const am = p.match(/^\/api\/admin\/paragraphs\/([\w-]+)$/);
    if (am && req.method === 'PUT') {
      const all = db.all();
      const i = all.findIndex((x) => x.id === am[1]);
      if (i === -1) return json(res, 404, { error: 'Not found' });
      const item = clean(JSON.parse(await readBody(req)), { ...all[i], updated: new Date().toISOString() });
      if (all.some((x, j) => j !== i && x.number === item.number)) throw new Error(`Number ${item.number} is already used.`);
      all[i] = item; db.save(all);
      return json(res, 200, item);
    }
    if (am && req.method === 'DELETE') {
      db.save(db.all().filter((x) => x.id !== am[1]));
      return json(res, 200, { ok: true });
    }
    if (p === '/api/admin/submissions' && req.method === 'GET') {
      const delivery = db.delivery();
      const look = (id) => (id && delivery[id]) || null;
      return json(res, 200, {
        submissions: db.submissions().map((x) => ({
          ...x,
          editorsDelivery: x.emailed ? look(x.editorsMessageId || `<${x.id}@amazingparagraph.com>`) : null,
          thanksDelivery: x.autoReplied ? look(x.thanksMessageId || `<thanks-${x.id}@amazingparagraph.com>`) : null,
        })),
      });
    }
    const rs = p.match(/^\/api\/admin\/submissions\/([\w-]+)\/resend$/);
    if (rs && req.method === 'POST') {
      const sub = db.submissions().find((x) => x.id === rs[1]);
      if (!sub) return json(res, 404, { error: 'Not found' });
      if (!process.env.SUBMISSIONS_TO) return json(res, 400, { error: 'Email is not set up on this server.' });
      await notifySubmission(sub, (sub.emailAttempts || 1) + 1);
      return json(res, 200, { ok: true });
    }
    const sm = p.match(/^\/api\/admin\/submissions\/([\w-]+)$/);
    if (sm && req.method === 'DELETE') {
      db.saveSubmissions(db.submissions().filter((x) => x.id !== sm[1]));
      return json(res, 200, { ok: true });
    }
    if (p === '/api/admin/site' && req.method === 'PUT') {
      const input = JSON.parse(await readBody(req));
      const keep = ['title', 'tagline', 'about', 'submissions', 'email', 'inquiriesEmail', 'instagram', 'labelFormat', 'aboutImage', 'autoReply', 'leadStyle'];
      const next = { ...site };
      for (const k of keep) if (k in input) next[k] = String(input[k]).slice(0, 10000);
      if ('formats' in input) next.formats = String(input.formats).split(',').map((s) => s.trim()).filter(Boolean);
      db.saveSite(next);
      return json(res, 200, next);
    }
    send(res, 404, layout({ site, page: '404', body: '<p class="empty">Nothing here.</p>' }));
  } catch (err) {
    if (p.startsWith('/api/')) return json(res, 400, { error: err.message });
    console.error(err);
    send(res, 500, 'Server error', 'text/plain');
  }
});

server.listen(PORT, () => console.log(`The Amazing Paragraph → http://localhost:${PORT}`));
