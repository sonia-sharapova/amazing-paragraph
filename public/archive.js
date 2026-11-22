// Archive filters, ordering and grid/index toggle (view choice remembered per browser).
(() => {
  const grid = document.querySelector('.grid');
  const toc = document.querySelector('.toc');
  if (!grid) return;
  const cells = [...grid.children];
  const groups = toc ? [...toc.querySelectorAll('.toc__group')] : [];
  const issue = document.querySelector('[data-filter="issue"]');
  const tag = document.querySelector('[data-filter="tag"]');
  const sort = document.querySelector('[data-sort]');
  const buttons = document.querySelectorAll('[data-view]');

  const hasTag = (el, t) => !t || el.dataset.tags.split('|').includes(t);

  function apply() {
    const i = issue?.value || '', t = tag?.value || '';
    const dir = sort.value === 'asc' ? 1 : -1;
    // grid
    cells.forEach((c) => { c.hidden = (i && c.dataset.issue !== i) || !hasTag(c, t); });
    cells.sort((a, b) => dir * (a.dataset.number - b.dataset.number)).forEach((c) => grid.append(c));
    // index
    groups.forEach((g) => {
      const list = g.querySelector('.toc__rows');
      const rows = [...list.children];
      rows.forEach((r) => { r.hidden = !hasTag(r, t); });
      rows.sort((a, b) => dir * (a.dataset.number - b.dataset.number)).forEach((r) => list.append(r));
      g.hidden = (i && g.dataset.issue !== i) || rows.every((r) => r.hidden);
    });
    groups.sort((a, b) => dir * (a.dataset.order - b.dataset.order)).forEach((g) => toc.append(g));
  }
  [issue, tag, sort].forEach((s) => s?.addEventListener('change', apply));

  function setView(v) {
    grid.hidden = v !== 'grid';
    if (toc) toc.hidden = v !== 'list';
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    try { localStorage.setItem('ap-archive-view', v); } catch {}
  }
  buttons.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  try { const v = localStorage.getItem('ap-archive-view'); if (v === 'list' || v === 'grid') setView(v); } catch {}
})();
