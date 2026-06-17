/* global Phaser */
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { BASE_W, BASE_H, SS } from './config.js';

const config = {
  type: Phaser.AUTO,
  backgroundColor: '#0b0b16',
  // FIT scales the canvas to the viewport while the internal coordinate system stays
  // 960x540, so every hard-coded layout/physics constant keeps working. The canvas
  // backing store is BASE*SS; each scene's camera zooms by SS to match (a no-op at
  // SS=1). CENTER_BOTH centers the letterboxed canvas.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game',
    width: BASE_W * SS,
    height: BASE_H * SS,
  },
  // antialias smooths vector edges (cheap, default); high-performance asks the browser
  // for the discrete GPU on hybrid machines. No MSAA (antialiasGL) so it does not pile
  // bandwidth onto the bloom/glow postFX passes.
  render: {
    antialias: true,
    powerPreference: 'high-performance',
  },
  scene: [BootScene, MenuScene, GameScene],
};

new Phaser.Game(config);
