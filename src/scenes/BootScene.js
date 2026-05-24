/* global Phaser */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Asset loading will go here.
  }

  create() {
    this.scene.start('MenuScene');
  }
}
