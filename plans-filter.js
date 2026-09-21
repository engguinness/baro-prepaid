(() => {
  const cards = [...document.querySelectorAll('.catalog-card')];
  const search = document.querySelector('#plan-search');
  const count = document.querySelector('#result-count');
  const empty = document.querySelector('#empty-state');
  const kindButtons = [...document.querySelectorAll('.filter-chip')];
  const networkButtons = [...document.querySelectorAll('.network-chip')];
  const resetButtons = [document.querySelector('#filter-reset'), document.querySelector('[data-empty-reset]')].filter(Boolean);
  let kind = 'all';
  let network = 'all';

  function setActive(buttons, selected, key) {
    buttons.forEach((button) => {
      const active = button.dataset[key] === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  // 숫자에 쉼표를 안 찍고 검색하는 경우가 많다 ("12100" → "12,100")
  const loose = (text) => text.replace(/,/g, '').replace(/\s+/g, ' ');

  function applyFilters() {
    const query = search.value.trim().toLocaleLowerCase('ko');
    const looseQuery = loose(query);
    let visible = 0;
    cards.forEach((card) => {
      const haystack = card.dataset.search;
      const hit = !query
        || haystack.includes(query)
        || loose(haystack).includes(looseQuery);
      const match = (kind === 'all' || card.dataset.kind === kind)
        && (network === 'all' || card.dataset.network === network)
        && hit;
      card.hidden = !match;
      if (match) visible += 1;
    });
    count.textContent = String(visible);
    empty.hidden = visible !== 0;
  }

  function revealLinkedPlan() {
    if (!location.hash.startsWith('#plan-P')) return;
    const target = document.querySelector(location.hash);
    if (!target) return;
    kind = 'all'; network = 'all'; search.value = '';
    setActive(kindButtons, kind, 'filter');
    setActive(networkButtons, network, 'network');
    applyFilters();
    const details = target.querySelector('details');
    if (details) details.open = true;
    requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  kindButtons.forEach((button) => button.addEventListener('click', () => {
    kind = button.dataset.filter;
    setActive(kindButtons, kind, 'filter');
    applyFilters();
  }));
  networkButtons.forEach((button) => button.addEventListener('click', () => {
    network = button.dataset.network;
    setActive(networkButtons, network, 'network');
    applyFilters();
  }));
  search.addEventListener('input', applyFilters);
  resetButtons.forEach((button) => button.addEventListener('click', () => {
    kind = 'all'; network = 'all'; search.value = '';
    setActive(kindButtons, kind, 'filter');
    setActive(networkButtons, network, 'network');
    applyFilters();
    search.focus();
  }));
  document.querySelectorAll('.recommend-links a').forEach((link) => link.addEventListener('click', () => {
    setTimeout(revealLinkedPlan, 0);
  }));
  window.addEventListener('hashchange', revealLinkedPlan);
  revealLinkedPlan();
})();
