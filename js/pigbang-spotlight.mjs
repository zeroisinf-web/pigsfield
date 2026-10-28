// User-selected spotlight picks use the catalog's existing learning-stage labels.
// A title can represent more than one stage without changing its source classification.
export const SPOTLIGHT_PICKS = [
  {
    "title": "Nukkad Naatak",
    "forClasses": [
      "PG",
      "Teacher Training"
    ]
  },
  {
    "title": "Cosmos: A Spacetime Odyssey",
    "forClasses": [
      "Graduation (UG)"
    ]
  },
  {
    "title": "The Thinking Game",
    "forClasses": [
      "Graduation (UG)"
    ]
  },
  {
    "title": "Dr. Stone",
    "forClasses": [
      "6-8"
    ]
  },
  {
    "title": "Breaking Bad",
    "forClasses": [
      "PG",
      "PhD"
    ]
  },
  {
    "title": "Scam 1992: The Harshad Mehta Story",
    "forClasses": [
      "Graduation (UG)",
      "PG"
    ]
  },
  {
    "title": "Malgudi Days",
    "forClasses": [
      "0-5",
      "6-8"
    ]
  },
  {
    "title": "Dr. Babasaheb Ambedkar",
    "forClasses": [
      "9-12",
      "Graduation (UG)"
    ]
  },
  {
    "title": "The Social Dilemma",
    "forClasses": [
      "9-12"
    ]
  },
  {
    "title": "Saattai",
    "forClasses": [
      "Teacher Training"
    ]
  },
  {
    "title": "The Man Who Knew Infinity",
    "forClasses": [
      "Graduation (UG)"
    ]
  },
  {
    "title": "Ship of Theseus",
    "forClasses": [
      "PG"
    ]
  }
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
