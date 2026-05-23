/* global Phaser */
import { LEVELS } from '../levels.js';

const PLAYER_X = 160;
const PLAYER_SIZE = 40;
const GROUND_HEIGHT = 60;
const JUMP_VELOCITY = -960;

const COLOR_PLAYER = 0x39c5ff;
const COLOR_GROUND = 0x2a2a33;
const COLOR_OBSTACLE = 0xff5252;
const COLOR_BAR = 0x39c5ff;
const COLOR_BAR_BG = 0x222228;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    this.levelIndex = data && typeof data.level === 'number' ? data.level : 0;
    this.cfg = LEVELS[this.levelIndex];
    this.gameState = 'ready';
    this.distance = 0;
    this.obstacles = [];
    this.pointerPressed = false;
  }

  create() {
    const { width, height } = this.scale;
    this.groundTop = height - GROUND_HEIGHT;

    this.ground = this.add.rectangle(
      width / 2,
      this.groundTop + GROUND_HEIGHT / 2,
      width,
      GROUND_HEIGHT,
      COLOR_GROUND
    );
    this.physics.add.existing(this.ground, true);

    this.player = this.add.rectangle(
      PLAYER_X,
      this.groundTop - PLAYER_SIZE / 2,
      PLAYER_SIZE,
      PLAYER_SIZE,
      COLOR_PLAYER
    );
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.ground);

    // Progress track + fill (fill scales from its left edge).
    this.add.rectangle(16, 10, width - 32, 6, COLOR_BAR_BG).setOrigin(0, 0);
    this.progressBar = this.add.rectangle(16, 10, width - 32, 6, COLOR_BAR).setOrigin(0, 0);
    this.progressBar.scaleX = 0;

    this.levelLabel = this.add.text(16, 22, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
    });

    this.banner = this.add
      .text(width / 2, height / 2, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '30px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5);

    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.upKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.input.keyboard.addCapture('SPACE,UP');
    this.input.on('pointerdown', () => {
      this.pointerPressed = true;
    });

    this.updateHud();
    this.showBanner(this.cfg.name + '\nPress Space or Tap to start');
  }

  update(time, delta) {
    const pressed =
      Phaser.Input.Keyboard.JustDown(this.spaceKey) ||
      Phaser.Input.Keyboard.JustDown(this.upKey) ||
      this.pointerPressed;
    this.pointerPressed = false;

    const stateAtFrameStart = this.gameState;
    if (this.gameState === 'running') {
      this.advance(delta);
    }

    if (!pressed) return;
    if (stateAtFrameStart === 'running') {
      // Only jump if the run is still alive after this frame's collision check.
      if (this.gameState === 'running') this.tryJump();
    } else {
      this.handleMenuPress();
    }
  }

  advance(delta) {
    const dx = this.cfg.speed * (delta / 1000);

    // Forgiving hit box: shrink the player's bounds slightly.
    const pb = this.player.getBounds();
    Phaser.Geom.Rectangle.Inflate(pb, -6, -6);

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.x -= dx;
      if (o.x + o.width / 2 < 0) {
        o.destroy();
        this.obstacles.splice(i, 1);
        continue;
      }
      if (Phaser.Geom.Intersects.RectangleToRectangle(pb, o.getBounds())) {
        this.die();
        return;
      }
    }

    this.distance += dx;
    this.updateHud();
    if (this.distance >= this.cfg.goal) this.completeLevel();
  }

  tryJump() {
    if (this.player.body.blocked.down) {
      this.player.body.setVelocityY(JUMP_VELOCITY);
    }
  }

  handleMenuPress() {
    if (this.gameState === 'ready') {
      this.startRun();
    } else if (this.gameState === 'dead') {
      this.scene.restart({ level: this.levelIndex });
    } else if (this.gameState === 'complete') {
      this.scene.restart({ level: this.levelIndex + 1 });
    } else if (this.gameState === 'won') {
      this.scene.restart({ level: 0 });
    }
  }

  startRun() {
    this.gameState = 'running';
    this.distance = 0;
    this.hideBanner();
    this.scheduleNextSpawn();
  }

  scheduleNextSpawn() {
    const delay = Phaser.Math.Between(this.cfg.spawnMin, this.cfg.spawnMax);
    this.time.delayedCall(delay, () => {
      if (this.gameState !== 'running') return;
      this.spawnObstacle();
      this.scheduleNextSpawn();
    });
  }

  spawnObstacle() {
    const h = Phaser.Math.Between(this.cfg.minH, this.cfg.maxH);
    const w = Phaser.Math.Between(24, 40);
    const obs = this.add.rectangle(this.scale.width + w, this.groundTop - h / 2, w, h, COLOR_OBSTACLE);
    this.obstacles.push(obs);
  }

  die() {
    this.gameState = 'dead';
    this.player.body.setVelocity(0, 0);
    this.showBanner('Game Over\n' + this.cfg.name + '\nPress Space or Tap to retry');
  }

  completeLevel() {
    this.player.body.setVelocity(0, 0);
    if (this.levelIndex + 1 < LEVELS.length) {
      this.gameState = 'complete';
      this.showBanner(this.cfg.name + ' complete\nPress Space or Tap to continue');
    } else {
      this.gameState = 'won';
      this.progressBar.scaleX = 1;
      this.showBanner('AtlasDash complete\nYou cleared every level\nPress Space or Tap to play again');
    }
  }

  updateHud() {
    this.levelLabel.setText(this.cfg.name);
    this.progressBar.scaleX = Phaser.Math.Clamp(this.distance / this.cfg.goal, 0, 1);
  }

  showBanner(text) {
    this.banner.setText(text).setVisible(true);
  }

  hideBanner() {
    this.banner.setVisible(false);
  }
}
