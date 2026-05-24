// Level definitions for AtlasDash.
// Difficulty comes from obstacle TYPES and spacing, never from speed: the scroll
// speed is a single fast constant (SPEED in GameScene). Each level draws from a
// set of obstacle patterns and a gap range between them.
//   patterns   which obstacle patterns can appear (see GameScene.spawnPattern)
//   gapMin/Max empty space between patterns in px (smaller = tighter reactions)
//   goal       distance to the end-of-level portal, in px
export const LEVELS = [
  { name: 'Level 1', patterns: ['spike1'], gapMin: 420, gapMax: 520, goal: 7800 },
  { name: 'Level 2', patterns: ['spike1', 'spike2'], gapMin: 380, gapMax: 480, goal: 8600 },
  { name: 'Level 3', patterns: ['spike1', 'spike2', 'block'], gapMin: 360, gapMax: 460, goal: 9400 },
  { name: 'Level 4', patterns: ['spike2', 'block', 'capped', 'blockSpike'], gapMin: 330, gapMax: 430, goal: 10200 },
  { name: 'Level 5', patterns: ['spike2', 'spike3', 'block', 'capped', 'blockSpike'], gapMin: 310, gapMax: 410, goal: 11000 },
  { name: 'Level 6', patterns: ['spike3', 'block', 'capped', 'blockSpike'], gapMin: 290, gapMax: 390, goal: 12000 },
];
