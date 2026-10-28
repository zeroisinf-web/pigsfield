// Editorial spotlight picks use the catalog's existing learning-stage labels.
// A title can represent more than one stage without changing its source classification.
export const SPOTLIGHT_PICKS = [
  { title: 'Nukkad Naatak', forClasses: ['PG', 'Teacher Training'] },
  { title: 'Our Planet', forClasses: ['0-5'] },
  { title: 'Planet Earth II', forClasses: ['6-8'] },
  { title: 'Cosmos: A Spacetime Odyssey', forClasses: ['Graduation (UG)'] },
  { title: 'Hidden Figures', forClasses: ['9-12'] },
  { title: 'The Biggest Little Farm', forClasses: ['Vocational & Skills'] },
  { title: '13th', forClasses: ['PhD'] },
  { title: 'The Social Dilemma', forClasses: ['9-12'] },
  { title: 'Life on Our Planet', forClasses: ['6-8'] },
  { title: 'David Attenborough: A Life on Our Planet', forClasses: ['9-12'] },
  { title: 'Honeyland', forClasses: ['Graduation (UG)'] },
  { title: 'Fantastic Fungi', forClasses: ['9-12'] }
];

export function spotlightEntries(items) {
  return SPOTLIGHT_PICKS.map(pick => {
    const item = items.find(candidate => candidate.category === 'movies' && candidate.title === pick.title);
    return item ? { ...item, spotlightClasses: pick.forClasses.filter(level => item.classes.includes(level)) } : null;
  }).filter(Boolean);
}

// Timer dependencies are injectable so cadence, wrapping and pauses can be tested
// without a browser or wall-clock sleeps.
export function createSpotlightRotation({
  count, show, intervalMs = 5000, blocked = () => false, paused = false,
  setIntervalFn = setInterval, clearIntervalFn = clearInterval
}) {
  let index = 0;
  let timer = null;
  let userPaused = paused;
  function stop() {
    if (timer !== null) clearIntervalFn(timer);
    timer = null;
  }
  function start() {
    if (timer !== null || userPaused || count < 2) return;
    timer = setIntervalFn(() => {
      if (!blocked()) move(index + 1, false);
    }, intervalMs);
  }
  function move(next, restart = true) {
    if (!count) return;
    index = ((next % count) + count) % count;
    show(index);
    if (restart) { stop(); start(); }
  }
  function setPaused(value) {
    userPaused = Boolean(value);
    stop();
    start();
  }
  return {
    start, stop, setPaused,
    next: () => move(index + 1),
    previous: () => move(index - 1),
    goTo: next => move(next),
    get index() { return index; },
    get paused() { return userPaused; }
  };
}
