// Editor: list, create, edit, delete paragraphs; edit site settings.
(() => {
  const list = document.querySelector('[data-list]');
  const form = document.querySelector('[data-form]');
  const siteForm = document.querySelector('[data-site-form]');
  let state = { site: {}, paragraphs: [] };
  let current = null; // paragraph object or null for new

  const ICON_VIEW = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
  const ICON_CLEAR = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = async (url, method = 'GET', body) => {
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
    if (r.status === 401) { location.reload(); throw new Error('Logged out'); }
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  };

  async function load(selectId) {
    state = await api('/api/admin/data');
    renderList();
    renderSite();
    const pick = state.paragraphs.find((p) => p.id === selectId) || state.paragraphs[0];
    pick ? edit(pick) : edit(null);
  }

  function renderList() {
    list.innerHTML = state.paragraphs.map((p) => `<li><button type="button" data-id="${p.id}" class="${current && current.id === p.id ? 'is-active' : ''}">
      <span>${esc(p.displayLabel)}</span><span>${esc(p.title || p.author || p.text.slice(0, 30))}</span>${p.status === 'draft' ? '<span class="draft">draft</span>' : '<span></span>'}
    </button></li>`).join('');
  }
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    edit(state.paragraphs.find((p) => p.id === b.dataset.id));
  });
  document.querySelector('[data-action="new"]').addEventListener('click', () => edit(null));

  const field = (name, lbl, value = '', opts = {}) => `<label>${lbl}${opts.area
    ? `<textarea name="${name}" rows="${opts.rows || 3}">${esc(value)}</textarea>`
    : `<input name="${name}" type="${opts.type || 'text'}" value="${esc(value)}" ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ''}>`}${opts.hint ? `<span class="hint">${opts.hint}</span>` : ''}</label>`;

  function edit(p, prefill) {
    current = p;
    renderList();
    const nextNum = state.paragraphs.reduce((m, x) => Math.max(m, x.number), 0) + 1;
    const v = p || { ...prefill, number: nextNum, published: new Date().toISOString().slice(0, 10), status: 'published', tags: [], appearedIn: [] };
    form.innerHTML = `
      ${field('text', 'Paragraph', v.text, { area: true, rows: 10, hint: 'Type <b>*word*</b> for <i>italics</i> and <b>**word**</b> for <b>bold</b>. See “Formatting &amp; rules” below.' })}
      <div class="preview" data-preview-wrap hidden><span class="preview__label">Preview — how it will look</span><p class="preview__text" data-preview></p></div>
      <details class="rules">
        <summary>Formatting &amp; rules</summary>
        <div class="rules__body">
          <h4>Formatting</h4>
          <table>
            <tr><td><code>*word*</code></td><td><i>word</i> — italics (titles of books, foreign words, emphasis)</td></tr>
            <tr><td><code>**word**</code></td><td><b>word</b> — bold</td></tr>
            <tr><td><code>***word***</code></td><td><b><i>word</i></b> — bold italics</td></tr>
          </table>
          <p>Nothing else is formatted: no headings, links or lists. Because asterisks switch formatting on and off, avoid using two of them in one paragraph for anything else (write “5 × 3”, not “5 * 3 * 2”).</p>
          <h4>The paragraph</h4>
          <ul>
            <li><b>One paragraph only.</b> Line breaks are joined into a single block, so pasting from a document is fine.</li>
            <li>Up to 8,000 characters. Curly quotes, dashes and accents (é, ö, —) all work.</li>
          </ul>
          <h4>Numbers, dates and labels</h4>
          <ul>
            <li><b>Number</b> is the publication order and is filled in automatically. Each number can only be used once.</li>
            <li><b>Custom label</b> replaces the number shown on the site for this paragraph only (e.g. “No. 12 · Winter”). Leave it empty to use the site-wide format in Site settings.</li>
            <li><b>Publish date</b> in the future schedules the paragraph — it appears on that day automatically.</li>
            <li><b>Status → Draft</b> keeps it hidden from the site until you switch it to Published.</li>
          </ul>
          <h4>Other fields</h4>
          <ul>
            <li><b>Title</b> is optional. Untitled paragraphs show their first words in the archive.</li>
            <li><b>Issue</b> groups paragraphs in the archive’s Index view; spell it the same way each time (“Issue 3”).</li>
            <li><b>Tags</b> and <b>Appeared in</b> are comma separated (“night, city” · “Print, Instagram”).</li>
            <li><b>Private notes</b> are never shown on the site.</li>
          </ul>
          <h4>Saving</h4>
          <ul>
            <li>Saving publishes immediately. <b>Delete</b> can’t be undone — download a backup first if unsure.</li>
          </ul>
        </div>
      </details>
      <div class="row">
        ${field('author', 'Author', v.author)}
        ${field('title', 'Title (optional)', v.title)}
      </div>
      <div class="row">
        ${field('number', 'Number', v.number, { type: 'number', hint: 'Publication order. Assigned automatically.' })}
        ${field('label', 'Custom label (optional)', v.label, { ph: 'e.g. No. 12 · Winter', hint: `Leave empty to use the site format → <b>${esc(p ? p.displayLabel : String(nextNum))}</b>` })}
        ${field('published', 'Publish date', v.published, { type: 'date', hint: 'Future dates stay hidden until that day.' })}
      </div>
      <div class="row">
        ${field('issue', 'Issue', v.issue, { ph: 'e.g. Issue 3' })}
        ${field('series', 'Series', v.series)}
        ${field('tags', 'Tags', (v.tags || []).join(', '), { hint: 'Comma separated.' })}
        ${field('appearedIn', 'Appeared in', (v.appearedIn || []).join(', '), { ph: 'Print, Magazine, Instagram' })}
      </div>
      ${field('notes', 'Private notes (never shown)', v.notes, { area: true, rows: 2 })}
      <label>Status <select name="status"><option value="published"${v.status !== 'draft' ? ' selected' : ''}>Published</option><option value="draft"${v.status === 'draft' ? ' selected' : ''}>Draft (hidden)</option></select></label>
      <div class="actions">
        <button type="submit" class="primary">${p ? 'Save changes' : 'Publish'}</button>
        ${p
          ? `<a class="btn" href="/p/${p.number}" target="_blank" rel="noopener">${ICON_VIEW}<span>View</span></a><button type="button" class="danger" data-action="delete">Delete</button>`
          : `<button type="button" data-action="clear">${ICON_CLEAR}<span>Clear</span></button>`}
        <span class="status" data-status></span>
      </div>`;
    // live preview of *italics* / **bold** — same rules as the public site
    const ta = form.querySelector('textarea[name="text"]'), pv = form.querySelector('[data-preview]'), pw = form.querySelector('[data-preview-wrap]');
    const renderPreview = () => {
      const t = ta.value.replace(/\s*\n+\s*/g, ' ').trim();
      pw.hidden = !/\*/.test(t);
      pv.innerHTML = esc(t).replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
    };
    ta.addEventListener('input', renderPreview); renderPreview();
    form.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
      const hasText = [...form.querySelectorAll('input, textarea')].some((el) => el.type !== 'date' && el.name !== 'number' && el.value.trim());
      if (hasText && !confirm('Clear everything you have typed in this form?')) return;
      edit(null);
      form.querySelector('textarea[name="text"]')?.focus();
    });
    form.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      if (!confirm(`Delete ${p.displayLabel}? This cannot be undone (a backup of the previous save is kept on the server).`)) return;
      await api(`/api/admin/paragraphs/${p.id}`, 'DELETE');
      current = null; load();
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = form.querySelector('[data-status]');
    const body = Object.fromEntries(new FormData(form));
    try {
      const saved = current ? await api(`/api/admin/paragraphs/${current.id}`, 'PUT', body) : await api('/api/admin/paragraphs', 'POST', body);
      await load(saved.id);
      form.querySelector('[data-status]').textContent = 'Saved.';
    } catch (err) { status.textContent = err.message; }
  });

  function renderSite() {
    const s = state.site;
    siteForm.innerHTML = `
      ${field('title', 'Magazine name', s.title)}
      ${field('tagline', 'Tagline', s.tagline)}
      <label>Latest paragraph style <select name="leadStyle"><option value="card"${s.leadStyle !== 'plain' ? ' selected' : ''}>Shadow card</option><option value="plain"${s.leadStyle === 'plain' ? ' selected' : ''}>Plain (no shadow)</option></select><span class="hint">How the newest paragraph is framed at the top of the home page.</span></label>
      ${field('labelFormat', 'Label format', s.labelFormat, { hint: 'How paragraphs are numbered when no custom label is set. Tokens: {n} = 12, {n:3} = 012, {roman} = XII, {issue}, {series}, {year}. Examples: "No. {n}", "{issue} / {n:2}", "¶ {roman}".' })}
      ${field('about', 'About text', s.about, { area: true, rows: 8, hint: 'Leave a blank line between paragraphs. <b>*word*</b> gives <i>italics</i>, <b>**word**</b> gives <b>bold</b>.' })}
      ${field('submissions', 'Submissions', s.submissions, { area: true, rows: 3 })}
      ${field('autoReply', 'Auto-reply to people who submit', s.autoReply, { area: true, rows: 8, hint: 'Sent from the general inquiries address to anyone who leaves an email. {name} becomes their name (left out for anonymous submissions). Leave empty to turn auto-replies off.' })}
      ${field('aboutImage', 'About page image', s.aboutImage, { hint: 'Path or URL of the picture on the About page. Put image files in public/images/ and use /static/images/name.png. Leave empty for none.' })}
      <div class="row">${field('inquiriesEmail', 'General inquiries email', s.inquiriesEmail)}${field('email', 'Submissions & editors email', s.email)}</div>
      <div class="row">${field('instagram', 'Instagram handle', s.instagram)}${field('formats', 'Formats', (s.formats || []).join(', '))}</div>
      <div class="actions"><button type="submit" class="primary">Save settings</button><span class="status" data-site-status></span></div>`;
  }
  siteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/site', 'PUT', Object.fromEntries(new FormData(siteForm)));
      await load(current?.id);
      siteForm.querySelector('[data-site-status]').textContent = 'Saved.';
    } catch (err) { siteForm.querySelector('[data-site-status]').textContent = err.message; }
  });

  // submissions from the About page form
  // delivery: did the email actually reach the inbox? (checked on the server every 2 minutes)
  const mailStatus = (label, handedOff, d, err) => {
    if (!handedOff) return err && !/not set|rate limit/.test(err) ? `<span class="mail mail--failed" title="${esc(err)}">✕ ${label}: not sent</span>` : '';
    if (!d) return `<span class="mail mail--pending">… ${label}: checking</span>`;
    if (d.status === 'delivered') return `<span class="mail mail--ok">✓ ${label}: delivered</span>`;
    const why = /quota|full|storage|insufficient/i.test(d.detail) ? 'inbox full' : (d.detail || '').replace(/^.*?said:\s*/, '').slice(0, 90);
    return d.status === 'waiting'
      ? `<span class="mail mail--waiting" title="${esc(d.detail)}">⧗ ${label}: waiting (${esc(why)}) — retrying for up to 5 days</span>`
      : `<span class="mail mail--failed" title="${esc(d.detail)}">✕ ${label}: not delivered (${esc(why)})</span>`;
  };
  const needsResend = (x) => (x.emailed && x.editorsDelivery && x.editorsDelivery.status !== 'delivered') || (!x.emailed && x.emailError && !/not set/.test(x.emailError));
  const subsList = document.querySelector('[data-subs]');
  async function loadSubs() {
    const { submissions } = await api('/api/admin/submissions');
    document.querySelector('[data-sub-count]').textContent = submissions.length ? `(${submissions.length})` : '';
    subsList.innerHTML = submissions.length ? submissions.map((x) => `<li data-id="${x.id}">
      <div class="subs__meta"><strong>${esc(x.name)}</strong>${x.anonymous ? ' <span>anonymous</span>' : ''} ${x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : '<span>no email</span>'} <span>${esc(x.received.slice(0, 10))}</span></div>
      <div class="subs__mail">${mailStatus('To editors', x.emailed, x.editorsDelivery, x.emailError)}${x.email ? mailStatus('Thank-you', x.autoReplied, x.thanksDelivery, x.autoReplyNote) : ''}</div>
      ${x.title ? `<p class="subs__title">${esc(x.title)}</p>` : ''}
      <p class="subs__text">${esc(x.text)}</p>
      <div class="actions"><button type="button" data-use>Use as new paragraph</button>${needsResend(x) ? '<button type="button" data-resend>Resend to editors</button>' : ''}<button type="button" class="danger" data-del>Delete</button></div>
    </li>`).join('') : '<li class="subs__empty">No submissions yet.</li>';
    subsList.onclick = async (e) => {
      const li = e.target.closest('li[data-id]'); if (!li) return;
      const x = submissions.find((s) => s.id === li.dataset.id);
      if (e.target.closest('[data-use]')) {
        edit(null, { author: x.name, title: x.title, text: x.text, status: 'draft', notes: `Submitted ${x.anonymous ? 'anonymously' : 'by ' + x.name}${x.email ? ' (' + x.email + ')' : ''} on ${x.received.slice(0, 10)}` });
        form.scrollIntoView({ behavior: 'smooth' });
      }
      if (e.target.closest('[data-resend]')) {
        const b = e.target.closest('[data-resend]'); b.disabled = true; b.textContent = 'Sending…';
        try { await api(`/api/admin/submissions/${x.id}/resend`, 'POST', {}); b.textContent = 'Sent — checking delivery…'; setTimeout(loadSubs, 150000); }
        catch (err) { b.disabled = false; b.textContent = 'Resend to editors'; alert(err.message); }
      }
      if (e.target.closest('[data-del]') && confirm(`Delete the submission from ${x.name}?`)) {
        await api(`/api/admin/submissions/${x.id}`, 'DELETE');
        loadSubs();
      }
    };
  }

  // download menu: close when clicking anywhere else or after choosing a file
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.dl[open]').forEach((d) => { if (!d.contains(e.target) || e.target.closest('.dl__menu a')) d.open = false; });
  });

  load();
  loadSubs();
})();
