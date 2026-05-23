// Level definitions for AtlasDash, ordered easiest to hardest.
// To add a level, append another entry. Difficulty comes from these knobs:
//   speed            obstacle approach speed in px/sec (higher = less reaction time)
//   spawnMin/spawnMax delay between obstacles in ms (smaller = denser)
//   minH/maxH        obstacle height range in px (taller = must jump earlier)
//   goal             distance to travel to clear the level, in px
export const LEVELS = [
  { name: 'Level 1', speed: 300, spawnMin: 1500, spawnMax: 2000, minH: 26, maxH: 40, goal: 3600 },
  { name: 'Level 2', speed: 340, spawnMin: 1300, spawnMax: 1750, minH: 28, maxH: 46, goal: 4800 },
  { name: 'Level 3', speed: 390, spawnMin: 1150, spawnMax: 1550, minH: 32, maxH: 54, goal: 6200 },
  { name: 'Level 4', speed: 440, spawnMin: 1000, spawnMax: 1400, minH: 36, maxH: 62, goal: 7600 },
  { name: 'Level 5', speed: 490, spawnMin: 920, spawnMax: 1250, minH: 40, maxH: 72, goal: 9000 },
  { name: 'Level 6', speed: 540, spawnMin: 900, spawnMax: 1180, minH: 44, maxH: 82, goal: 10500 },
];
