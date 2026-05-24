/* global Phaser */
import { LEVELS } from '../levels.js';

const PLAYER_X = 160;
const PLAYER_SIZE = 40;
const HALF = PLAYER_SIZE / 2;
const GROUND_HEIGHT = 60;

// Constant fast scroll. Difficulty comes from obstacle TYPES, not speed.
const SPEED = 620;
const GRAVITY = 4300;
const JUMP_V = -900; // apex ~94px (~2.3 blocks), airtime ~0.42s, jump ~5.7 blocks
const SPIN_RATE = 600;

const BLOCK = 40; // grid / block unit
const SPIKE_W = 40;
const SPIKE_H = 40;
const LAND_EPS = 8; // tolerance separating a top-landing from a side hit

const COLOR_BG = 0x0b0b16;
const COLOR_BG_PULSE = 0x141430;
const COLOR_PLAYER = 0x2ee6ff;
const COLOR_GROUND = 0x12121c;
const COLOR_GROUND_LINE = 0x2ee6ff;
const COLOR_SPIKE = 0xff2e63;
const COLOR_BLOCK_FILL = 0x1a1a2e;
const COLOR_BLOCK_LINE = 0xffffff;
const COLOR_PORTAL = 0x39ff6a;
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
    this.attempts = data && typeof data.attempts === 'number' ? data.attempts : 0;
    this.gameState = 'ready';
    this.distance = 0;
    this.obstacles = [];
    this.trails = [];
    this.pointerJustDown = false;
    this.wasGrounded = true;
    this.grounded = true;
    this.vy = 0;
    this.prevBottom = 0;
    this.portal = null;
    this.portalSpawned = false;
    this.lastPatternW = 0;
  }

  create() {
    const { width, height } = this.scale;
    this.groundTop = height - GROUND_HEIGHT;
    this.prevBottom = this.groundTop;
    this.accent = this.cfg.accent || COLOR_BAR;

    this.bg = this.add.rectangle(0, 0, width, height, COLOR_BG).setOrigin(0, 0).setDepth(-20);

    if (!this.textures.exists('atlas-grid')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.lineStyle(1, COLOR_GRID, 1);
      g.strokeRect(0, 0, BLOCK, BLOCK);
      g.generateTexture('atlas-grid', BLOCK, BLOCK);
      g.destroy();
    }
    this.grid = this.add
      .tileSprite(0, 0, width, this.groundTop, 'atlas-grid')
      .setOrigin(0, 0)
      .setAlpha(0.5)
      .setDepth(-10);

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
    this.groundLine = this.add.rectangle(width / 2, this.groundTop, width, 4, this.accent);
    this.addGlow(this.groundLine, this.accent, 4);

    this.player = this.add.rectangle(PLAYER_X, this.groundTop - HALF, PLAYER_SIZE, PLAYER_SIZE, COLOR_PLAYER);
    this.addGlow(this.player, COLOR_PLAYER, 4);

    this.add.rectangle(16, 10, width - 32, 6, COLOR_BAR_BG).setOrigin(0, 0).setDepth(5);
    this.progressBar = this.add.rectangle(16, 10, width - 32, 6, this.accent).setOrigin(0, 0).setDepth(5);
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
    const holding = this.spaceKey.isDown || this.upKey.isDown || this.input.activePointer.isDown;

    this.pulseBackground(time);

    if (this.gameState === 'running') {
      this.advance(delta);
      // Hold-to-jump: holding rejumps on every landing (core Geometry Dash feel).
      if (this.gameState === 'running') {
        if (holding) this.tryJump();
        this.updateSpin(delta);
      }
    } else if (justPressed) {
      this.handleMenuPress();
    }
  }

  advance(delta) {
    const dt = Math.min(delta, 40) / 1000; // clamp so a frame hitch can't tunnel obstacles
    const dx = SPEED * dt;
    this.grid.tilePositionX += dx;
    this.spawnTrail();
    this.updateTrails(dx, delta);

    // Scroll obstacles, reposition their parts, cull off-screen.
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.x -= dx;
      for (const part of o.gos) part.go.x = o.x + part.dx;
      if (o.x + o.w < 0) {
        for (const part of o.gos) part.go.destroy();
        this.obstacles.splice(i, 1);
      }
    }

    // Scroll the finish portal; reaching the player completes the level.
    if (this.portal) {
      this.portal.x -= dx;
      if (this.portal.x <= PLAYER_X) {
        this.completeLevel();
        return;
      }
    }

    // Manual kinematic player (gravity + jump arc under our control).
    this.vy += GRAVITY * dt;
    this.player.y += this.vy * dt;
    if (this.player.y < HALF) {
      this.player.y = HALF;
      this.vy = 0;
    }
    const bottom = this.player.y + HALF;

    // Resolve hazards + figure out the surface under the player this frame.
    const hurt = this.playerHurtBox();
    const footL = PLAYER_X - (HALF - 2);
    const footR = PLAYER_X + (HALF - 2);
    let supportTop = this.groundTop;

    for (const o of this.obstacles) {
      if (o.type === 'spike') {
        if (Phaser.Geom.Intersects.RectangleToRectangle(hurt, this.spikeHitBox(o))) {
          this.die();
          return;
        }
      } else if (o.type === 'capped') {
        const box = new Phaser.Geom.Rectangle(o.x + 3, o.top + 3, o.w - 6, o.h - 6);
        if (Phaser.Geom.Intersects.RectangleToRectangle(hurt, box)) {
          this.die();
          return;
        }
      } else if (o.type === 'block') {
        const overlapX = footR > o.x && footL < o.x + o.w;
        if (overlapX) {
          if (this.prevBottom <= o.top + LAND_EPS) {
            supportTop = Math.min(supportTop, o.top); // landing on / riding the top
          } else {
            this.die(); // ran into the side
            return;
          }
        }
      }
    }

    if (bottom >= supportTop) {
      this.player.y = supportTop - HALF;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    this.prevBottom = this.player.y + HALF;

    this.distance += dx;
    this.updateHud();
    this.maybeSpawnPortal();
  }

  playerHurtBox() {
    const h = HALF - 6; // forgiving 28x28 box, independent of the cube's spin
    return new Phaser.Geom.Rectangle(this.player.x - h, this.player.y - h, h * 2, h * 2);
  }

  // Lethal zone is the lower-center of the spike, so clearing the apex is safe.
  spikeHitBox(o) {
    const hitW = Math.min(20, o.w * 0.5);
    const hitH = o.h * 0.55;
    return new Phaser.Geom.Rectangle(o.x + (o.w - hitW) / 2, this.groundTop - hitH, hitW, hitH);
  }

  updateSpin(delta) {
    if (!this.grounded) {
      this.player.angle += SPIN_RATE * (delta / 1000);
    } else if (!this.wasGrounded) {
      this.player.angle = Math.round(this.player.angle / 90) * 90;
    }
    this.wasGrounded = this.grounded;
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
    if (this.grounded) {
      this.vy = JUMP_V;
      this.grounded = false;
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
    this.vy = 0;
    this.grounded = true;
    this.attempts += 1;
    this.attemptLabel.setText('Attempt ' + this.attempts);
    this.hideBanner();
    this.scheduleNextSpawn();
  }

  scheduleNextSpawn() {
    const gap = Phaser.Math.Between(this.cfg.gapMin, this.cfg.gapMax);
    const delay = ((this.lastPatternW + gap) / SPEED) * 1000;
    this.spawnTimer = this.time.delayedCall(delay, () => {
      if (this.gameState !== 'running' || this.portalSpawned) return;
      this.lastPatternW = this.spawnPattern(Phaser.Utils.Array.GetRandom(this.cfg.patterns));
      this.scheduleNextSpawn();
    });
  }

  spawnPattern(key) {
    const x = this.scale.width + 20;
    if (key === 'spike1') {
      this.addSpike(x);
      return SPIKE_W;
    }
    if (key === 'spike2') {
      this.addSpike(x);
      this.addSpike(x + SPIKE_W);
      return SPIKE_W * 2;
    }
    if (key === 'spike3') {
      this.addSpike(x);
      this.addSpike(x + SPIKE_W);
      this.addSpike(x + SPIKE_W * 2);
      return SPIKE_W * 3;
    }
    if (key === 'block') {
      const bw = Phaser.Math.Between(60, 140);
      this.addBlock(x, bw, BLOCK);
      return bw;
    }
    if (key === 'capped') {
      this.addCapped(x, BLOCK, 14); // short, clearable from the ground
      return BLOCK;
    }
    if (key === 'blockCapped') {
      // Platform then a tall spiked block: only clearable by jumping off the block.
      this.addBlock(x, 80, BLOCK);
      this.addCapped(x + 160, 80, 24);
      return 160 + BLOCK;
    }
    if (key === 'blockSpike') {
      this.addBlock(x, 80, BLOCK);
      this.addSpike(x + 80 + 120);
      return 80 + 120 + SPIKE_W;
    }
    this.addSpike(x);
    return SPIKE_W;
  }

  addSpike(x, h = SPIKE_H) {
    const w = SPIKE_W;
    const tri = this.add.triangle(x, this.groundTop - h, 0, h, w, h, w / 2, 0, COLOR_SPIKE).setOrigin(0, 0);
    this.addGlow(tri, COLOR_SPIKE, 3);
    this.obstacles.push({ type: 'spike', x, w, h, top: this.groundTop - h, gos: [{ go: tri, dx: 0 }] });
  }

  addBlock(x, w, h) {
    const top = this.groundTop - h;
    const rect = this.add.rectangle(x, top, w, h, COLOR_BLOCK_FILL).setOrigin(0, 0);
    rect.setStrokeStyle(2, COLOR_BLOCK_LINE, 1);
    this.addGlow(rect, COLOR_BLOCK_LINE, 2);
    this.obstacles.push({ type: 'block', x, w, h, top, gos: [{ go: rect, dx: 0 }] });
  }

  addCapped(x, blockH, spikeH) {
    const w = BLOCK;
    const totalH = blockH + spikeH;
    const top = this.groundTop - totalH;
    const rect = this.add.rectangle(x, this.groundTop - blockH, w, blockH, COLOR_BLOCK_FILL).setOrigin(0, 0);
    rect.setStrokeStyle(2, COLOR_SPIKE, 1);
    const s1 = this.add
      .triangle(x, top, 0, spikeH, w / 2, spikeH, w / 4, 0, COLOR_SPIKE)
      .setOrigin(0, 0);
    const s2 = this.add
      .triangle(x + w / 2, top, 0, spikeH, w / 2, spikeH, w / 4, 0, COLOR_SPIKE)
      .setOrigin(0, 0);
    this.addGlow(rect, COLOR_SPIKE, 2);
    this.obstacles.push({
      type: 'capped',
      x,
      w,
      h: totalH,
      top,
      gos: [{ go: rect, dx: 0 }, { go: s1, dx: 0 }, { go: s2, dx: w / 2 }],
    });
  }

  maybeSpawnPortal() {
    if (this.portalSpawned) return;
    const remaining = this.cfg.goal - this.distance;
    if (remaining <= this.scale.width - PLAYER_X) {
      this.portalSpawned = true;
      this.spawnPortal(PLAYER_X + remaining); // reaches PLAYER_X exactly at the goal
      if (this.spawnTimer) this.spawnTimer.remove(false);
    }
  }

  spawnPortal(x) {
    const h = this.groundTop * 0.86;
    const gate = this.add.rectangle(x, this.groundTop, 26, h, COLOR_PORTAL, 0.18).setOrigin(0.5, 1);
    gate.setStrokeStyle(3, COLOR_PORTAL, 1);
    this.addGlow(gate, COLOR_PORTAL, 6);
    this.portal = gate;
  }

  die() {
    this.gameState = 'dead';
    this.vy = 0;
    this.cameras.main.shake(250, 0.012);
    this.showBanner('Game Over\n' + this.cfg.name + '\nPress Space or Tap to retry');
  }

  completeLevel() {
    this.vy = 0;
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
