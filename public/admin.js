// Editor: list, create, edit, delete paragraphs; edit site settings.
(() => {
  const list = document.querySelector('[data-list]');
  const form = document.querySelector('[data-form]');
  const siteForm = document.querySelector('[data-site-form]');
  let state = { site: {}, paragraphs: [] };
  let current = null; // paragraph object or null for new

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
      ${field('text', 'Paragraph', v.text, { area: true, rows: 10, hint: 'One paragraph. Line breaks are joined. Use *asterisks* for italics and **double** for bold.' })}
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
        ${p ? `<a href="/p/${p.number}" target="_blank">View</a><button type="button" class="danger" data-action="delete">Delete</button>` : ''}
        <span class="status" data-status></span>
      </div>`;
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
      ${field('labelFormat', 'Label format', s.labelFormat, { hint: 'How paragraphs are numbered when no custom label is set. Tokens: {n} = 12, {n:3} = 012, {roman} = XII, {issue}, {series}, {year}. Examples: "No. {n}", "{issue} / {n:2}", "¶ {roman}".' })}
      ${field('about', 'About text', s.about, { area: true, rows: 8, hint: 'Leave a blank line between paragraphs.' })}
      ${field('submissions', 'Submissions', s.submissions, { area: true, rows: 3 })}
      ${field('aboutImage', 'About page image', s.aboutImage, { hint: 'Path or URL of the picture on the About page. Put image files in public/images/ and use /static/images/name.png. Leave empty for none.' })}
      <div class="row">${field('email', 'Email', s.email)}${field('instagram', 'Instagram handle', s.instagram)}${field('formats', 'Formats', (s.formats || []).join(', '))}</div>
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

  // TEMP: submissions from the About page form
  const subsList = document.querySelector('[data-subs]');
  async function loadSubs() {
    const { submissions } = await api('/api/admin/submissions');
    document.querySelector('[data-sub-count]').textContent = submissions.length ? `(${submissions.length})` : '';
    subsList.innerHTML = submissions.length ? submissions.map((x) => `<li data-id="${x.id}">
      <div class="subs__meta"><strong>${esc(x.name)}</strong> <a href="mailto:${esc(x.email)}">${esc(x.email)}</a> <span>${esc(x.received.slice(0, 10))}</span></div>
      ${x.title ? `<p class="subs__title">${esc(x.title)}</p>` : ''}
      <p class="subs__text">${esc(x.text)}</p>
      <div class="actions"><button type="button" data-use>Use as new paragraph</button><button type="button" class="danger" data-del>Delete</button></div>
    </li>`).join('') : '<li class="subs__empty">No submissions yet.</li>';
    subsList.onclick = async (e) => {
      const li = e.target.closest('li[data-id]'); if (!li) return;
      const x = submissions.find((s) => s.id === li.dataset.id);
      if (e.target.closest('[data-use]')) {
        edit(null, { author: x.name, title: x.title, text: x.text, status: 'draft', notes: `Submitted by ${x.email} on ${x.received.slice(0, 10)}` });
        form.scrollIntoView({ behavior: 'smooth' });
      }
      if (e.target.closest('[data-del]') && confirm(`Delete the submission from ${x.name}?`)) {
        await api(`/api/admin/submissions/${x.id}`, 'DELETE');
        loadSubs();
      }
    };
  }

  load();
  loadSubs();
})();
