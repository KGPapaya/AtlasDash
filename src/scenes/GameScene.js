/* global Phaser */
import { LEVELS } from '../levels.js';

const PLAYER_X = 160;
const PLAYER_SIZE = 40;
const GROUND_HEIGHT = 60;
const JUMP_VELOCITY = -960;
const GRID = 40; // background grid cell, ~ one Geometry Dash block
const HITBOX_INSET = 6; // forgiveness per side -> 28x28 lethal box, rotation-independent
const SPIN_RATE = 600; // degrees/sec while airborne (~one rotation per jump)

// Neon-on-dark palette: cyan = you, magenta = danger.
const COLOR_BG = 0x0b0b16;
const COLOR_BG_PULSE = 0x141430;
const COLOR_PLAYER = 0x2ee6ff;
const COLOR_GROUND = 0x12121c;
const COLOR_GROUND_LINE = 0x2ee6ff;
const COLOR_SPIKE = 0xff2e63;
const COLOR_GRID = 0x1e2742;
const COLOR_BAR = 0x2ee6ff;
const COLOR_BAR_BG = 0x191926;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    this.levelIndex = data && typeof data.level === 'number' ? data.level : 0;
    this.cfg = LEVELS[this.levelIndex];
    // Attempts persist across retries of a level (passed through restart), reset on a new level.
    this.attempts = data && typeof data.attempts === 'number' ? data.attempts : 0;
    this.gameState = 'ready';
    this.distance = 0;
    this.obstacles = [];
    this.trails = [];
    this.pointerJustDown = false;
    this.wasGrounded = true;
  }

  create() {
    const { width, height } = this.scale;
    this.groundTop = height - GROUND_HEIGHT;

    this.bg = this.add.rectangle(0, 0, width, height, COLOR_BG).setOrigin(0, 0).setDepth(-20);

    // Scrolling square grid (texture built once, reused across restarts).
    if (!this.textures.exists('atlas-grid')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.lineStyle(1, COLOR_GRID, 1);
      g.strokeRect(0, 0, GRID, GRID);
      g.generateTexture('atlas-grid', GRID, GRID);
      g.destroy();
    }
    this.grid = this.add
      .tileSprite(0, 0, width, this.groundTop, 'atlas-grid')
      .setOrigin(0, 0)
      .setAlpha(0.5)
      .setDepth(-10);

    // Large faint attempt counter behind the action (Geometry Dash staple).
    this.attemptLabel = this.add
      .text(width / 2, this.groundTop * 0.42, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        color: '#33405e',
      })
      .setOrigin(0.5)
      .setDepth(-5);

    this.ground = this.add.rectangle(
      width / 2,
      this.groundTop + GROUND_HEIGHT / 2,
      width,
      GROUND_HEIGHT,
      COLOR_GROUND
    );
    this.physics.add.existing(this.ground, true);
    this.groundLine = this.add.rectangle(width / 2, this.groundTop, width, 4, COLOR_GROUND_LINE);
    this.addGlow(this.groundLine, COLOR_GROUND_LINE, 4);

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
    this.addGlow(this.player, COLOR_PLAYER, 4);

    // HUD: progress track + fill + level label + percent.
    this.add.rectangle(16, 10, width - 32, 6, COLOR_BAR_BG).setOrigin(0, 0).setDepth(5);
    this.progressBar = this.add.rectangle(16, 10, width - 32, 6, COLOR_BAR).setOrigin(0, 0).setDepth(5);
    this.progressBar.scaleX = 0;

    this.levelLabel = this.add
      .text(16, 22, '', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#ffffff' })
      .setDepth(5);
    this.percentLabel = this.add
      .text(width - 16, 22, '0%', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#ffffff' })
      .setOrigin(1, 0)
      .setDepth(5);

    this.banner = this.add
      .text(width / 2, height / 2, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '30px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.upKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.input.keyboard.addCapture('SPACE,UP');
    this.input.on('pointerdown', () => {
      this.pointerJustDown = true;
    });

    this.updateHud();
    this.showBanner(this.cfg.name + '\nPress Space or Tap to start');
  }

  update(time, delta) {
    const justPressed =
      Phaser.Input.Keyboard.JustDown(this.spaceKey) ||
      Phaser.Input.Keyboard.JustDown(this.upKey) ||
      this.pointerJustDown;
    this.pointerJustDown = false;

    // Holding the jump input rejumps on every landing (core GD feel).
    const holding =
      this.spaceKey.isDown || this.upKey.isDown || this.input.activePointer.isDown;

    this.pulseBackground(time);

    if (this.gameState === 'running') {
      this.advance(delta);
      if (this.gameState === 'running') {
        if (holding) this.tryJump();
        this.updateSpin(delta);
      }
    } else if (justPressed) {
      this.handleMenuPress();
    }
  }

  advance(delta) {
    const dx = this.cfg.speed * (delta / 1000);
    this.grid.tilePositionX += dx;
    this.spawnTrail();
    this.updateTrails(dx, delta);

    // Fixed, centered hit box so the cube's spin never inflates collisions.
    const half = (PLAYER_SIZE - HITBOX_INSET * 2) / 2;
    const pb = new Phaser.Geom.Rectangle(this.player.x - half, this.player.y - half, half * 2, half * 2);

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.x -= dx;
      if (o.x + o.width < 0) {
        o.destroy();
        this.obstacles.splice(i, 1);
        continue;
      }
      if (Phaser.Geom.Intersects.RectangleToRectangle(pb, this.spikeHitBox(o))) {
        this.die();
        return;
      }
    }

    this.distance += dx;
    this.updateHud();
    if (this.distance >= this.cfg.goal) this.completeLevel();
  }

  // Forgiving lethal zone: a narrow box in the lower-center of the spike, so
  // clearing the apex is safe (matches GD's generous spike hitboxes).
  spikeHitBox(o) {
    const w = o.width;
    const h = o.height;
    const hitW = Math.min(20, w * 0.5);
    const hitH = h * 0.55;
    return new Phaser.Geom.Rectangle(o.x + (w - hitW) / 2, this.groundTop - hitH, hitW, hitH);
  }

  updateSpin(delta) {
    const grounded = this.player.body.blocked.down;
    if (!grounded) {
      this.player.angle += SPIN_RATE * (delta / 1000);
    } else if (!this.wasGrounded) {
      this.player.angle = Math.round(this.player.angle / 90) * 90;
    }
    this.wasGrounded = grounded;
  }

  spawnTrail() {
    const t = this.add
      .rectangle(this.player.x, this.player.y, PLAYER_SIZE, PLAYER_SIZE, COLOR_PLAYER)
      .setAngle(this.player.angle)
      .setAlpha(0.32)
      .setDepth(-1);
    this.trails.push(t);
  }

  updateTrails(dx, delta) {
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      tr.x -= dx;
      tr.alpha -= (delta / 1000) * 1.4;
      const s = Math.max(0.4, tr.alpha / 0.32);
      tr.scaleX = s;
      tr.scaleY = s;
      if (tr.alpha <= 0 || tr.x + PLAYER_SIZE < 0) {
        tr.destroy();
        this.trails.splice(i, 1);
      }
    }
  }

  pulseBackground(time) {
    const p = 0.5 + 0.5 * Math.sin((time / 1000) * Math.PI * 2 * (130 / 60));
    const a = COLOR_BG;
    const b = COLOR_BG_PULSE;
    const r = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * p);
    const g = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * p);
    const bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * p);
    this.bg.fillColor = (r << 16) | (g << 8) | bl;
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
      this.scene.restart({ level: this.levelIndex, attempts: this.attempts });
    } else if (this.gameState === 'complete') {
      this.scene.restart({ level: this.levelIndex + 1 });
    } else if (this.gameState === 'won') {
      this.scene.restart({ level: 0 });
    }
  }

  startRun() {
    this.gameState = 'running';
    this.distance = 0;
    this.attempts += 1;
    this.attemptLabel.setText('Attempt ' + this.attempts);
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
    const w = Phaser.Math.Clamp(Math.round(h * 0.75), 28, 64);
    const x = this.scale.width + 20;
    const spike = this.add
      .triangle(x, this.groundTop - h, 0, h, w, h, w / 2, 0, COLOR_SPIKE)
      .setOrigin(0, 0);
    this.addGlow(spike, COLOR_SPIKE, 3);
    this.obstacles.push(spike);
  }

  die() {
    this.gameState = 'dead';
    this.player.body.setVelocity(0, 0);
    this.cameras.main.shake(250, 0.012);
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
      this.percentLabel.setText('100%');
      this.showBanner('AtlasDash complete\nYou cleared every level\nPress Space or Tap to play again');
    }
  }

  updateHud() {
    this.levelLabel.setText(this.cfg.name);
    const pct = Phaser.Math.Clamp(this.distance / this.cfg.goal, 0, 1);
    this.progressBar.scaleX = pct;
    this.percentLabel.setText(Math.floor(pct * 100) + '%');
  }

  addGlow(obj, color, strength) {
    try {
      if (obj.postFX && obj.postFX.addGlow) obj.postFX.addGlow(color, strength, 0);
    } catch (e) {
      /* No WebGL postFX available; the plain fill still renders. */
    }
  }

  showBanner(text) {
    this.banner.setText(text).setVisible(true);
  }

  hideBanner() {
    this.banner.setVisible(false);
  }
}
