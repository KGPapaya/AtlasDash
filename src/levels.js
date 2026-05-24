// Level definitions for AtlasDash.
// Difficulty comes from obstacle TYPES and spacing, never from speed: the scroll
// speed is a single fast constant (SPEED in GameScene). Each level draws from a
// set of obstacle patterns and a gap range between them.
//   accent     per-level neon accent (ground line + progress bar) for progression
//   patterns   which obstacle patterns can appear (see GameScene.spawnPattern)
//   gapMin/Max empty space between patterns in px (smaller = tighter reactions)
//   goal       distance to the end-of-level portal, in px
export const LEVELS = [
  { name: 'Level 1', accent: 0x2ee6ff, patterns: ['spike1', 'block'], gapMin: 480, gapMax: 600, goal: 8200 },
  { name: 'Level 2', accent: 0x39ff6a, patterns: ['spike1', 'spike2', 'block'], gapMin: 440, gapMax: 560, goal: 9200 },
  { name: 'Level 3', accent: 0xffd23f, patterns: ['spike2', 'block', 'capped', 'blockSpike'], gapMin: 410, gapMax: 520, goal: 10200 },
  { name: 'Level 4', accent: 0xff8e3c, patterns: ['spike2', 'spike3', 'block', 'capped', 'blockSpike', 'blockCapped'], gapMin: 380, gapMax: 490, goal: 11200 },
  { name: 'Level 5', accent: 0xb46bff, patterns: ['spike3', 'block', 'capped', 'blockSpike', 'blockCapped'], gapMin: 350, gapMax: 460, goal: 12400 },
  { name: 'Level 6', accent: 0xff2e63, patterns: ['spike3', 'block', 'capped', 'blockSpike', 'blockCapped'], gapMin: 330, gapMax: 440, goal: 13600 },
];
