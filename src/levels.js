// Level definitions for AtlasDash, ordered easiest to hardest.
// To add a level, append another entry. Difficulty comes from these knobs:
//   speed            obstacle approach speed in px/sec (higher = less reaction time)
//   spawnMin/spawnMax delay between obstacles in ms (smaller = denser)
//   minH/maxH        obstacle height range in px (taller = must jump earlier)
//   goal             distance to travel to clear the level, in px
export const LEVELS = [
  { name: 'Level 1', speed: 300, spawnMin: 1400, spawnMax: 1900, minH: 28, maxH: 42, goal: 4200 },
  { name: 'Level 2', speed: 380, spawnMin: 1050, spawnMax: 1500, minH: 32, maxH: 58, goal: 6000 },
  { name: 'Level 3', speed: 470, spawnMin: 900, spawnMax: 1300, minH: 38, maxH: 72, goal: 8200 },
];
