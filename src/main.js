/* global Phaser */
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { BASE_W, BASE_H, getSS } from './config.js';

const config = {
  type: Phaser.AUTO,
  backgroundColor: '#0b0b16',
  // FIT scales the canvas to the viewport while the internal coordinate system stays
  // 960x540, so every hard-coded layout/physics constant keeps working. The canvas
  // backing store boots at BASE*getSS() (native, or the last calibrated value); each
  // scene's camera zooms to match and GameScene adapts it at runtime by measured FPS.
  // CENTER_BOTH centers the letterboxed canvas.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game',
    width: BASE_W * getSS(),
    height: BASE_H * getSS(),
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
