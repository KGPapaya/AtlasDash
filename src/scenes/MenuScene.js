/* global Phaser */
import { LEVELS } from '../levels.js';
import { audio } from '../audio.js';
import { BASE_W, BASE_H, getSS } from '../config.js';

const COLOR_BG = 0x0b0b16;
const COLOR_TITLE = 0x2ee6ff;
const BLOCK = 40;

const COLS = 5;
const CARD_W = 150;
const CARD_H = 66;
const GAP_X = 20;
const GAP_Y = 16;
const GRID_TOP = 150;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const width = BASE_W;
    const height = BASE_H;
    this.selecting = false;
    this.selIndex = 0;
    this.cards = [];
    this.textRes = getSS(); // crisp text on the current backing store

    // Render the 960x540 world across the current (adaptively calibrated) backing store.
    this.cameras.main.setZoom(getSS());
    this.cameras.main.centerOn(BASE_W / 2, BASE_H / 2);

    const sky = this.add.graphics().setDepth(-30);
    const mid = mix(0x150b2e, COLOR_TITLE, 0.1);
    sky.fillGradientStyle(COLOR_BG, COLOR_BG, mid, mid, 1);
    sky.fillRect(0, 0, width, Math.round(height * 0.5));
    sky.fillGradientStyle(mid, mid, 0x09060f, 0x09060f, 1);
    sky.fillRect(0, Math.round(height * 0.5), width, height);

    const gridKey = 'atlas-grid-w';
    if (!this.textures.exists(gridKey)) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.lineStyle(1, 0xffffff, 1);
      g.strokeRect(0, 0, BLOCK, BLOCK);
      g.generateTexture(gridKey, BLOCK, BLOCK);
      g.destroy();
    }
    this.grid = this.add
      .tileSprite(0, 0, width, height, gridKey)
      .setOrigin(0, 0)
      .setAlpha(0.12)
      .setDepth(-10);
    this.grid.setTint(COLOR_TITLE);

    this.pulseOverlay = this.add
      .rectangle(0, 0, width, height, COLOR_TITLE, 0)
      .setOrigin(0, 0)
      .setDepth(-25);
    this.applyCameraFx();

    const title = this.add
      .text(width / 2, 64, 'ATLASDASH', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '52px',
        color: '#2ee6ff',
        fontStyle: 'bold',
        resolution: this.textRes,
      })
      .setOrigin(0.5);
    this.addGlow(title, COLOR_TITLE, 4);

    this.add
      .text(width / 2, 116, 'Select a level', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '20px',
        color: '#9fb0d0',
        resolution: this.textRes,
      })
      .setOrigin(0.5);

    const totalW = COLS * CARD_W + (COLS - 1) * GAP_X;
    const leftX = (width - totalW) / 2;

    for (let i = 0; i < LEVELS.length; i++) {
      const r = Math.floor(i / COLS);
      const c = i % COLS;
      const cx = leftX + CARD_W / 2 + c * (CARD_W + GAP_X);
      const cy = GRID_TOP + CARD_H / 2 + r * (CARD_H + GAP_Y);
      const accent = LEVELS[i].accent;

      const fill = this.add.rectangle(cx, cy, CARD_W, CARD_H, accent, 0.1);
      fill.setStrokeStyle(2, accent, 0.9);
      this.addGlow(fill, accent, 2);

      const label = this.add
        .text(cx, cy - 16, 'LEVEL', {
          fontFamily: 'Arial, sans-serif',
          fontSize: '10px',
          color: '#9fb0d0',
          resolution: this.textRes,
        })
        .setOrigin(0.5);
      const num = this.add
        .text(cx, cy + 9, String(i + 1), {
          fontFamily: 'Arial, sans-serif',
          fontSize: '28px',
          color: hexColor(accent),
          fontStyle: 'bold',
          resolution: this.textRes,
        })
        .setOrigin(0.5);

      fill.setInteractive({ useHandCursor: true });
      fill.on('pointerover', () => {
        this.selIndex = i;
        this.refreshCards();
      });
      fill.on('pointerdown', () => this.launch(i));

      this.cards.push({ fill, label, num, accent });
    }

    this.add
      .text(width / 2, 500, 'Click a level, or use the arrow keys and press Space. Number keys 1 to 9, 0 for 10.', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        color: '#6b7a99',
        resolution: this.textRes,
      })
      .setOrigin(0.5);

    this.input.keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SPACE,ENTER');
    this.input.keyboard.on('keydown', (e) => this.onKey(e));

    this.refreshCards();
    this.createMuteButton();
    this.createFullscreenButton();
  }

  onKey(e) {
    if (this.selecting) return;
    audio.resume();
    const code = e.code;
    if (code === 'ArrowRight') this.move(1, 0);
    else if (code === 'ArrowLeft') this.move(-1, 0);
    else if (code === 'ArrowDown') this.move(0, 1);
    else if (code === 'ArrowUp') this.move(0, -1);
    else if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') this.launch(this.selIndex);
    else if (code.startsWith('Digit')) {
      const d = parseInt(code.slice(5), 10);
      const idx = d === 0 ? 9 : d - 1;
      if (idx >= 0 && idx < LEVELS.length) this.launch(idx);
    }
  }

  move(dc, dr) {
    const rows = Math.ceil(LEVELS.length / COLS);
    let c = this.selIndex % COLS;
    let r = Math.floor(this.selIndex / COLS);
    c = (c + dc + COLS) % COLS;
    r = (r + dr + rows) % rows;
    let idx = r * COLS + c;
    if (idx >= LEVELS.length) idx = LEVELS.length - 1;
    this.selIndex = idx;
    this.refreshCards();
    audio.uiMove();
  }

  refreshCards() {
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      const sel = i === this.selIndex;
      card.fill.setFillStyle(card.accent, sel ? 0.22 : 0.08);
      card.fill.setStrokeStyle(sel ? 4 : 2, card.accent, sel ? 1 : 0.9);
      card.fill.setScale(sel ? 1.06 : 1);
      card.num.setScale(sel ? 1.06 : 1);
      card.label.setScale(sel ? 1.06 : 1);
    }
  }

  launch(i) {
    if (this.selecting) return;
    this.selecting = true;
    audio.resume();
    audio.uiSelect();
    this.scene.start('GameScene', { level: i });
  }

  update(time) {
    const p = 0.5 + 0.5 * Math.sin((time / 1000) * Math.PI * 2 * (130 / 60));
    if (this.pulseOverlay) this.pulseOverlay.alpha = 0.05 * p;
    this.grid.tilePositionX += 0.6;
  }

  applyCameraFx() {
    try {
      const cam = this.cameras.main;
      if (!cam.postFX) return;
      if (cam.postFX.addBloom) cam.postFX.addBloom(0xffffff, 1, 1, 1.1, 0.6, 4);
      if (cam.postFX.addVignette) cam.postFX.addVignette(0.5, 0.5, 0.82, 0.35);
      if (cam.postFX.addColorMatrix) cam.postFX.addColorMatrix().saturate(0.18);
    } catch (e) {
      /* No WebGL postFX available; plain fills still render. */
    }
  }

  addGlow(obj, color, strength) {
    try {
      if (obj.postFX && obj.postFX.addGlow) obj.postFX.addGlow(color, strength, 0);
    } catch (e) {
      /* No WebGL postFX available; the plain fill still renders. */
    }
  }

  // Clickable speaker toggle (bottom-right). Mute state lives on the audio
  // singleton, so it persists between the menu and the game.
  createMuteButton() {
    const x = BASE_W - 24;
    const y = BASE_H - 22;
    this.muteG = this.add.graphics().setDepth(6);
    this.muteHit = this.add
      .rectangle(x, y, 36, 30, 0x000000, 0.001)
      .setDepth(6)
      .setInteractive({ useHandCursor: true });
    this.muteHit.on('pointerdown', () => {
      audio.resume();
      audio.toggleMute();
      this.drawMuteIcon();
    });
    this.drawMuteIcon();
  }

  drawMuteIcon() {
    const g = this.muteG;
    if (!g) return;
    const x = BASE_W - 24;
    const y = BASE_H - 22;
    g.clear();
    const col = 0x9fb0d0;
    g.fillStyle(col, 1);
    g.fillRect(x - 10, y - 4, 5, 8);
    g.fillTriangle(x - 5, y - 8, x - 5, y + 8, x + 1, y);
    if (audio.muted) {
      g.lineStyle(2.5, 0xff5577, 1);
      g.beginPath();
      g.moveTo(x - 12, y - 9);
      g.lineTo(x + 8, y + 9);
      g.strokePath();
    } else {
      g.lineStyle(2, col, 1);
      g.beginPath();
      g.arc(x + 3, y, 5, -0.6, 0.6);
      g.strokePath();
      g.beginPath();
      g.arc(x + 3, y, 9, -0.6, 0.6);
      g.strokePath();
    }
  }

  // Tap-to-fullscreen toggle, left of the mute button. Only shown where the
  // Fullscreen API exists (iPhone Safari does not; those players use Add to
  // Home Screen). Fullscreen entered here persists into the game scene.
  createFullscreenButton() {
    if (!this.scale.fullscreen || !this.scale.fullscreen.available) return;
    const x = BASE_W - 64;
    const y = BASE_H - 22;
    this.fsG = this.add.graphics().setDepth(6);
    this.fsHit = this.add
      .rectangle(x, y, 36, 30, 0x000000, 0.001)
      .setDepth(6)
      .setInteractive({ useHandCursor: true });
    this.fsHit.on('pointerdown', () => {
      audio.resume();
      this.scale.toggleFullscreen();
    });
    this.drawFullscreenIcon();
  }

  drawFullscreenIcon() {
    const g = this.fsG;
    if (!g) return;
    const x = BASE_W - 64;
    const y = BASE_H - 22;
    g.clear();
    g.lineStyle(2, 0x9fb0d0, 1);
    const s = 8;
    const a = 5;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const cx = x + sx * s;
        const cy = y + sy * s;
        g.beginPath();
        g.moveTo(cx - sx * a, cy);
        g.lineTo(cx, cy);
        g.lineTo(cx, cy - sy * a);
        g.strokePath();
      }
    }
  }
}

function hexColor(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

function mix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}
