const filter = document.querySelector('#area-filter');
const cards = [...document.querySelectorAll('.area-card')];
const emptyState = document.querySelector('#empty-state');

filter.addEventListener('change', () => {
  const selected = filter.value;
  let visible = 0;

  cards.forEach((card) => {
    const matches = selected === 'all' || card.dataset.area === selected;
    card.hidden = !matches;
    if (matches) visible += 1;
  });

  emptyState.hidden = visible !== 0;
});
