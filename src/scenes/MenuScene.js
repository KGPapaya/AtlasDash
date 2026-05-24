/* global Phaser */
import { LEVELS } from '../levels.js';

const COLOR_BG = 0x0b0b16;
const COLOR_BG_PULSE = 0x141430;
const COLOR_GRID = 0x1e2742;
const COLOR_TITLE = 0x2ee6ff;
const BLOCK = 40;

const COLS = 5;
const CARD_W = 150;
const CARD_H = 110;
const GAP_X = 24;
const GAP_Y = 36;
const GRID_TOP = 175;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const { width, height } = this.scale;
    this.selecting = false;
    this.selIndex = 0;
    this.cards = [];

    this.bg = this.add.rectangle(0, 0, width, height, COLOR_BG).setOrigin(0, 0).setDepth(-20);

    if (!this.textures.exists('atlas-grid')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.lineStyle(1, COLOR_GRID, 1);
      g.strokeRect(0, 0, BLOCK, BLOCK);
      g.generateTexture('atlas-grid', BLOCK, BLOCK);
      g.destroy();
    }
    this.grid = this.add
      .tileSprite(0, 0, width, height, 'atlas-grid')
      .setOrigin(0, 0)
      .setAlpha(0.4)
      .setDepth(-10);

    const title = this.add
      .text(width / 2, 64, 'ATLASDASH', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '52px',
        color: '#2ee6ff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.addGlow(title, COLOR_TITLE, 4);

    this.add
      .text(width / 2, 116, 'Select a level', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '20px',
        color: '#9fb0d0',
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

      const fill = this.add.rectangle(cx, cy, CARD_W, CARD_H, accent, 0.08);
      fill.setStrokeStyle(2, accent, 0.9);
      this.addGlow(fill, accent, 2);

      const label = this.add
        .text(cx, cy - 24, 'LEVEL', {
          fontFamily: 'Arial, sans-serif',
          fontSize: '13px',
          color: '#8a9ab8',
        })
        .setOrigin(0.5);
      const num = this.add
        .text(cx, cy + 12, String(i + 1), {
          fontFamily: 'Arial, sans-serif',
          fontSize: '44px',
          color: hexColor(accent),
          fontStyle: 'bold',
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
      })
      .setOrigin(0.5);

    this.input.keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SPACE,ENTER');
    this.input.keyboard.on('keydown', (e) => this.onKey(e));

    this.refreshCards();
  }

  onKey(e) {
    if (this.selecting) return;
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
    this.scene.start('GameScene', { level: i });
  }

  update(time) {
    const p = 0.5 + 0.5 * Math.sin((time / 1000) * Math.PI * 2 * (130 / 60));
    const a = COLOR_BG;
    const b = COLOR_BG_PULSE;
    const r = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * p);
    const g = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * p);
    const bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * p);
    this.bg.fillColor = (r << 16) | (g << 8) | bl;
    this.grid.tilePositionX += 0.6;
  }

  addGlow(obj, color, strength) {
    try {
      if (obj.postFX && obj.postFX.addGlow) obj.postFX.addGlow(color, strength, 0);
    } catch (e) {
      /* No WebGL postFX available; the plain fill still renders. */
    }
  }
}

function hexColor(n) {
  return '#' + n.toString(16).padStart(6, '0');
}
