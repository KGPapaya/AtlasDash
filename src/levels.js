// Level definitions for AtlasDash.
// Difficulty comes from obstacle TYPES and spacing, never from speed: the scroll
// speed is a single fast constant (SPEED in GameScene). Each level draws from a
// set of obstacle patterns and a gap range between them.
//   accent     per-level neon accent (ground line + progress bar) for progression
//   patterns   which obstacle patterns can appear (see GameScene.spawnPattern)
//   gapMin/Max empty space between patterns in px (smaller = tighter reactions)
//   goal       distance to the end-of-level portal, in px
//   gravity    optional; true draws the inverted-gravity ceiling band (flip levels)
export const LEVELS = [
  { name: 'Level 1', accent: 0x2ee6ff, patterns: ['spike1', 'block', 'platform'], gapMin: 480, gapMax: 600, goal: 8200 },
  { name: 'Level 2', accent: 0x39ff6a, patterns: ['spike1', 'spike2', 'block', 'platform'], gapMin: 440, gapMax: 560, goal: 9200 },
  { name: 'Level 3', accent: 0xffd23f, patterns: ['spike2', 'block', 'capped', 'blockSpike', 'platform', 'platform'], gapMin: 410, gapMax: 520, goal: 10200 },
  { name: 'Level 4', accent: 0xff8e3c, patterns: ['spike2', 'spike3', 'block', 'capped', 'blockSpike', 'blockCapped', 'platform', 'highPlatform', 'ceiling'], gapMin: 380, gapMax: 490, goal: 11200 },
  { name: 'Level 5', accent: 0xb46bff, patterns: ['spike3', 'block', 'capped', 'blockSpike', 'blockCapped', 'platform', 'highPlatform', 'ceiling'], gapMin: 350, gapMax: 460, goal: 12400 },
  { name: 'Level 6', accent: 0xff2e63, patterns: ['spike3', 'block', 'capped', 'blockSpike', 'blockCapped', 'platform', 'highPlatform', 'ceiling'], gapMin: 330, gapMax: 440, goal: 13600 },
  { name: 'Level 7', accent: 0x00e5a0, patterns: ['spike3', 'block', 'capped', 'blockSpike', 'blockCapped', 'blockCapped', 'platform', 'highPlatform', 'ceiling'], gapMin: 320, gapMax: 420, goal: 14800 },
  { name: 'Level 8', accent: 0xffc400, patterns: ['spike3', 'spike3', 'block', 'capped', 'blockSpike', 'blockCapped', 'blockCapped', 'platform', 'highPlatform', 'ceiling', 'ceiling'], gapMin: 300, gapMax: 400, goal: 16200 },
  { name: 'Level 9', accent: 0xff5722, patterns: ['spike3', 'spike3', 'block', 'capped', 'blockSpike', 'blockCapped', 'blockCapped', 'blockCapped', 'highPlatform', 'ceiling', 'ceiling'], gapMin: 285, gapMax: 380, goal: 17800 },
  { name: 'Level 10', accent: 0xff0048, patterns: ['spike3', 'spike3', 'blockCapped', 'blockCapped', 'blockCapped', 'block', 'capped', 'blockSpike', 'highPlatform', 'ceiling', 'ceiling', 'platform'], gapMin: 270, gapMax: 360, goal: 19600 },
  { name: 'Level 11', accent: 0xae00ff, patterns: ['spike3', 'blockCapped', 'capped', 'block', 'blockSpike', 'platform', 'highPlatform', 'ceiling', 'orbGap', 'padWall'], gapMin: 268, gapMax: 358, goal: 21000 },
  { name: 'Level 12', accent: 0x00ffc8, patterns: ['spike3', 'spike3', 'blockCapped', 'blockCapped', 'capped', 'blockSpike', 'highPlatform', 'ceiling', 'ceiling', 'orbGap', 'padWall'], gapMin: 258, gapMax: 350, goal: 22500 },
  { name: 'Level 13', accent: 0xff5e00, patterns: ['spike3', 'spike3', 'blockCapped', 'blockCapped', 'capped', 'ceiling', 'ceiling', 'highPlatform', 'orbGap', 'orbGap', 'padWall'], gapMin: 248, gapMax: 342, goal: 24000 },
  { name: 'Level 14', accent: 0x4dd2ff, gravity: true, patterns: ['spike3', 'block', 'capped', 'blockSpike', 'platform', 'highPlatform', 'orbGap', 'flipHop', 'flipHop'], gapMin: 262, gapMax: 350, goal: 25500 },
  { name: 'Level 15', accent: 0xb14dff, gravity: true, patterns: ['spike3', 'block', 'capped', 'blockCapped', 'platform', 'highPlatform', 'orbGap', 'padWall', 'flipHop', 'flipLane'], gapMin: 254, gapMax: 342, goal: 27000 },
  { name: 'Level 16', accent: 0x4dffb0, gravity: true, patterns: ['spike3', 'blockCapped', 'capped', 'blockSpike', 'highPlatform', 'orbGap', 'padWall', 'flipHop', 'flipLane', 'flipHop'], gapMin: 248, gapMax: 336, goal: 28500 },
  { name: 'Level 17', accent: 0xff4da6, gravity: true, patterns: ['spike3', 'spike3', 'blockCapped', 'capped', 'highPlatform', 'orbGap', 'padWall', 'flipHop', 'flipLane', 'flipLane'], gapMin: 244, gapMax: 330, goal: 30000 },
  { name: 'Level 18', accent: 0x5a7bff, gravity: true, patterns: ['spike3', 'blockCapped', 'blockCapped', 'capped', 'highPlatform', 'orbGap', 'padWall', 'flipHop', 'flipHop', 'flipLane', 'flipLane'], gapMin: 240, gapMax: 325, goal: 31500 },
  { name: 'Level 19', accent: 0xff8a4d, gravity: true, patterns: ['spike3', 'spike3', 'blockCapped', 'capped', 'blockSpike', 'highPlatform', 'orbGap', 'padWall', 'flipHop', 'flipLane', 'flipLane', 'flipHop'], gapMin: 238, gapMax: 320, goal: 33000 },
  { name: 'Level 20', accent: 0xff3860, gravity: true, patterns: ['spike3', 'spike3', 'blockCapped', 'blockCapped', 'capped', 'blockSpike', 'platform', 'highPlatform', 'orbGap', 'padWall', 'flipHop', 'flipLane', 'flipHop', 'flipLane'], gapMin: 236, gapMax: 315, goal: 35000 },
];
