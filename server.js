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
  submissions: path.join(DATA_DIR, 'submissions.json'), // TEMP submission form
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
const inline = (s = '') => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');

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
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${title} — ${site.title}` : site.title)}</title>
<meta name="description" content="${esc(site.tagline)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><text x='2' y='13' font-family='Helvetica' font-size='14'>¶</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@400&family=Alegreya+Sans:wght@400&family=Josefin+Sans:wght@400&display=swap">
<link rel="stylesheet" href="/static/style.css">
<script>/* TEMP grid-paper + title-font preview */try{var h=document.documentElement;if(localStorage.getItem('ap-grid')==='1')h.classList.add('paper-grid');var t=localStorage.getItem('ap-title-font');if(t)h.dataset.titleFont=t}catch(e){}</script>
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
  <span>${site.email ? `<a href="mailto:${esc(site.email)}">Email</a>` : ''}${insta ? `<a href="${insta}" rel="noopener">Instagram</a>` : ''}<a class="editor-link" href="/admin">Editor login</a></span>
</footer>
<!-- TEMP: grid-paper preview toggle. Delete this button + script (and the head script) once decided. -->
<button type="button" class="grid-toggle" aria-pressed="false">Grid paper</button>
<button type="button" class="font-toggle">Title: Jost</button>
<script>(function(){var b=document.querySelector('.grid-toggle'),h=document.documentElement;
function s(){b.setAttribute('aria-pressed',String(h.classList.contains('paper-grid')))}s();
b.addEventListener('click',function(){h.classList.toggle('paper-grid');try{localStorage.setItem('ap-grid',h.classList.contains('paper-grid')?'1':'0')}catch(e){}s()});
var fonts=[['jost','Jost'],['alegreya','Alegreya Sans'],['josefin','Josefin Sans']],f=document.querySelector('.font-toggle');
function cur(){var i=fonts.findIndex(function(x){return x[0]===h.dataset.titleFont});return i<0?0:i}
function l(){f.textContent='Title: '+fonts[cur()][1]}l();
f.addEventListener('click',function(){var n=fonts[(cur()+1)%fonts.length][0];h.dataset.titleFont=n;try{localStorage.setItem('ap-title-font',n)}catch(e){}l()})})();</script>
</body>
</html>`;
}

function paragraphBlock(v, { lead = false } = {}) {
  return `<article class="para${lead ? ' para--lead' : ''}" id="p${v.number}" data-number="${v.number}">
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
  ${first.length ? `<p class="stream__kicker stream__kicker--lead">Latest</p>${paragraphBlock(first[0], { lead: true })}
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

function aboutPage(site, flash) {
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
  const sent = flash === 'sent', err = flash === 'error';
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
        <!-- TEMP: submission form (entries land in data/submissions.json and the editor) -->
        ${sent ? '<p class="form-note">Thank you — your paragraph has been received.</p>' : `
        <form class="submit-form" method="post" action="/submit">
          <div class="row">
            <label>Name, as it should be printed <input name="name" required maxlength="120" autocomplete="name"></label>
            <label>Email <input name="email" type="email" required maxlength="200" autocomplete="email"></label>
          </div>
          <label>Title (optional) <input name="title" maxlength="200"></label>
          <label>Your paragraph <textarea name="text" rows="9" required maxlength="8000"></textarea></label>
          <label class="hp" aria-hidden="true">Leave empty <input name="website" tabindex="-1" autocomplete="off"></label>
          ${err ? '<p class="error">Please fill in your name, email and paragraph.</p>' : ''}
          <div><button type="submit">Submit paragraph</button></div>
        </form>`}
      </div>
      <div class="about__block">
        <h2>Contact</h2>
        <ul class="about__links">
          ${site.email ? `<li><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></li>` : ''}
          ${insta ? `<li><a href="${insta}" rel="noopener">${esc(site.instagram)}</a></li>` : ''}
        </ul>
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
    <div><a href="/admin/export.json" download>Download backup</a> <form method="post" action="/admin/logout" class="inline"><button type="submit">Log out</button></form></div>
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

// ---------- auth ----------
const sessions = new Map(); // token -> expiry
const submitTimes = new Map(); // ip -> last submission (TEMP form)
const attempts = new Map(); // ip -> { n, until }
const SESSION_MS = 1000 * 60 * 60 * 12;
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }));
}
function isAuthed(req) {
  const t = parseCookies(req).ap_session;
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
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
    if (req.method === 'GET' && p === '/about') return send(res, 200, aboutPage(site, url.searchParams.get('sent') ? 'sent' : url.searchParams.get('error') ? 'error' : ''));

    // TEMP: public submission form
    if (req.method === 'POST' && p === '/submit') {
      const ip = req.socket.remoteAddress;
      const last = submitTimes.get(ip) || 0;
      const f = new URLSearchParams(await readBody(req, 64e3));
      const back = (q) => send(res, 303, '', 'text/plain', { Location: `/about?${q}#submit` });
      if (f.get('website')) return back('sent=1'); // honeypot: bots fill hidden field
      if (Date.now() - last < 30e3) return back('sent=1'); // 1 per 30s per visitor
      const sub = {
        id: crypto.randomUUID(),
        name: (f.get('name') || '').trim().slice(0, 120),
        email: (f.get('email') || '').trim().slice(0, 200),
        title: (f.get('title') || '').trim().slice(0, 200),
        text: (f.get('text') || '').replace(/\s*\n+\s*/g, ' ').trim().slice(0, 8000),
        received: new Date().toISOString(),
      };
      if (!sub.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sub.email) || !sub.text) return back('error=1');
      submitTimes.set(ip, Date.now());
      db.saveSubmissions([sub, ...db.submissions()]);
      return back('sent=1');
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
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + SESSION_MS);
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      return send(res, 303, '', 'text/plain', { Location: '/admin', 'Set-Cookie': `ap_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}` });
    }
    if (p === '/admin/logout' && req.method === 'POST') {
      sessions.delete(parseCookies(req).ap_session);
      return send(res, 303, '', 'text/plain', { Location: '/about', 'Set-Cookie': 'ap_session=; Path=/; Max-Age=0' });
    }
    if (p.startsWith('/admin/') || p.startsWith('/api/admin/')) {
      if (!isAuthed(req)) return json(res, 401, { error: 'Not logged in' });
      // writes must be JSON (blocks plain cross-site form posts)
      if (req.method !== 'GET' && !(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'JSON required' });
    }
    if (p === '/admin/export.json') {
      return send(res, 200, JSON.stringify({ site, paragraphs: db.all() }, null, 2), 'application/json', { 'Content-Disposition': `attachment; filename="amazing-paragraph-backup-${new Date().toISOString().slice(0, 10)}.json"` });
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
    if (p === '/api/admin/submissions' && req.method === 'GET') return json(res, 200, { submissions: db.submissions() });
    const sm = p.match(/^\/api\/admin\/submissions\/([\w-]+)$/);
    if (sm && req.method === 'DELETE') {
      db.saveSubmissions(db.submissions().filter((x) => x.id !== sm[1]));
      return json(res, 200, { ok: true });
    }
    if (p === '/api/admin/site' && req.method === 'PUT') {
      const input = JSON.parse(await readBody(req));
      const keep = ['title', 'tagline', 'about', 'submissions', 'email', 'instagram', 'labelFormat', 'aboutImage'];
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
