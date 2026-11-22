// Infinite scroll for the home stream + live highlighting of the right-hand index.
(() => {
  const stream = document.querySelector('.stream');
  if (!stream) return;
  const sentinel = stream.querySelector('.stream__sentinel');
  const end = stream.querySelector('.stream__end');
  const total = Number(stream.dataset.total);
  const size = Number(stream.dataset.pageSize);
  let offset = stream.querySelectorAll('.para').length;
  let loading = false;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const render = (v) => {
    const el = document.createElement('article');
    el.className = 'para is-new';
    el.id = 'p' + v.number;
    el.dataset.number = v.number;
    el.innerHTML = `
      <div class="para__meta"><a class="para__label" href="/p/${v.number}">${esc(v.label)}</a><span class="para__date">${esc(v.date)}</span></div>
      <div class="para__body">
        ${v.title ? `<h2 class="para__title">${esc(v.title)}</h2>` : ''}
        <p class="para__text">${v.html}</p>
        <p class="para__byline">${esc(v.author)}${v.issue ? `<span>${esc(v.issue)}</span>` : ''}</p>
      </div>`;
    return el;
  };

  async function more() {
    if (loading || offset >= total) return;
    loading = true;
    try {
      const r = await fetch(`/api/paragraphs?offset=${offset}&limit=${size}`);
      const { items } = await r.json();
      items.forEach((v) => { const el = render(v); sentinel.before(el); watch(el); });
      offset += items.length;
      if (!items.length) offset = total;
    } finally { loading = false; }
    if (offset >= total) { end.hidden = false; io.disconnect(); }
  }
  const io = new IntersectionObserver((e) => e[0].isIntersecting && more(), { rootMargin: '900px 0px' });
  if (offset < total) io.observe(sentinel); else if (total > 1) end.hidden = false;

  // index highlighting
  const links = new Map([...document.querySelectorAll('.index a')].map((a) => [a.dataset.number, a]));
  const visible = new Set();
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => en.isIntersecting ? visible.add(en.target) : visible.delete(en.target));
    const top = [...visible].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    if (!top) return;
    links.forEach((a) => a.classList.remove('is-current'));
    const a = links.get(top.dataset.number);
    if (a) { a.classList.add('is-current'); a.scrollIntoView({ block: 'nearest' }); }
  }, { rootMargin: '-20% 0px -50% 0px' });
  function watch(el) { spy.observe(el); }
  stream.querySelectorAll('.para').forEach(watch);

  // clicking an index entry for a paragraph not yet loaded: load until it exists
  document.querySelector('.index')?.addEventListener('click', async (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    let target = document.getElementById('p' + a.dataset.number);
    while (!target && offset < total) { await more(); target = document.getElementById('p' + a.dataset.number); }
    target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
})();


