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
  // BACKING store is BASE*SS (1920x1080); each scene's camera zooms by SS so the
  // 960x540 world fills it, giving crisp native-resolution rendering instead of a
  // soft FIT-upscale. CENTER_BOTH centers the letterboxed canvas.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game',
    width: BASE_W * SS,
    height: BASE_H * SS,
  },
  // High-quality scaling for the supersampled canvas; high-performance asks the
  // browser for the discrete GPU on hybrid machines.
  render: {
    antialias: true,
    antialiasGL: true,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  scene: [BootScene, MenuScene, GameScene],
};

new Phaser.Game(config);
