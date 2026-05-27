/* global Phaser */
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';

const config = {
  type: Phaser.AUTO,
  backgroundColor: '#0b0b16',
  // FIT scales the canvas to the viewport while the internal coordinate system stays
  // 960x540, so every hard-coded layout/physics constant (and pointer hit-testing,
  // which FIT remaps into game space) keeps working. CENTER_BOTH centers the
  // letterboxed canvas; the bars take the body background so they look intentional.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game',
    width: 960,
    height: 540,
  },
  scene: [BootScene, MenuScene, GameScene],
};

new Phaser.Game(config);
