/* global Phaser */
import { LEVELS } from '../levels.js';
import { audio } from '../audio.js';
import { BASE_W, BASE_H, SS_LADDER, getSS, setSS, isCalibrated, setCalibrated } from '../config.js';

// Adaptive supersample probe thresholds. Promote (sharper) only while comfortably
// above PROMOTE; demote (safety net, always on) the moment we sit below DEMOTE. The
// gap is hysteresis so it never oscillates. PROBE_WINDOW frames of actual gameplay are
// averaged per decision (~2.5s at 60fps) so a single hitch never flips the tier.
const FPS_PROMOTE = 58;
const FPS_DEMOTE = 50;
const PROBE_WINDOW = 150;

const PLAYER_X = 160;
const PLAYER_SIZE = 40;
const HALF = PLAYER_SIZE / 2;
const GROUND_HEIGHT = 60;

// Constant fast scroll. Difficulty comes from obstacle TYPES, not speed.
const SPEED = 620;
const GRAVITY = 4300;
const JUMP_V = -900; // apex ~94px (~2.3 blocks), airtime ~0.42s, jump ~5.7 blocks
const SPIN_RATE = 600;

// Physics runs on a FIXED timestep, decoupled from the display refresh rate, then the
// rendered positions are interpolated between the last two steps. This makes the jump
// arc identical on 60/120/144Hz (apex stays the measured ~86.8px the levels are tuned
// to, instead of drifting up to ~92px on high-refresh panels) AND keeps motion buttery
// smooth on any monitor. Stepping at 1/60 reproduces the exact arc the game was tuned
// at; the interpolation is what removes judder at other refresh rates.
const FIXED_DT = 1 / 60; // seconds per physics step (matches the tuned 60fps arc)
const FIXED_MS = 1000 / 60;
const MAX_CATCHUP = 40; // ms; caps catch-up at ~2 steps/frame (anti-spiral + anti-tunnel)

// Early-tap window: a jump pressed up to this long before touchdown still fires on
// landing, so taps feel as tight as Geometry Dash instead of being silently dropped.
const JUMP_BUFFER_MS = 110;

const BLOCK = 40; // grid / block unit
const SPIKE_W = 40;
const SPIKE_H = 40;
const LAND_EPS = 8; // tolerance separating a top-landing from a side hit

// Vertical play: ride platforms (jump onto and run along) + ceiling hazards.
// Tuned to the measured jump arc: apex ~87px above the takeoff surface at 60fps,
// so the player's bottom reaches groundTop-87 from flat ground. PLAT_LOW clears
// that with margin (reachable from the ground); PLAT_HIGH does not (needs a step).
// CEIL_CLEAR leaves a ground lane that only a grounded (non-jumping) player fits.
const PLAT_LOW = 72; // standalone platform top = groundTop - 72 (ground-reachable)
const PLAT_HIGH = 108; // high platform top = groundTop - 108 (step-reachable only)
const PLAT_T = 18; // platform slab thickness
const CEIL_CLEAR = 70; // safe run-lane height beneath a ceiling section

// "Logic to pass" set-pieces: a jump orb gives a mid-air second jump (the only
// way across a wide spike pit); a jump pad super-launches you (the only way over
// a tall wall). PAD_V is tuned so a pad launch clears a wall a normal jump cannot.
const PAD_V = -1240; // jump-pad launch velocity (apex well above a normal jump)
const ORB_R = 28; // jump-orb activation radius (generous)

const COLOR_BG = 0x0b0b16;
const COLOR_PLAYER = 0x2ee6ff;
const COLOR_PLAYER_EDGE = 0x0a3d4a; // dark cube outline (defined GD-icon edge)
const COLOR_PLAYER_INNER = 0xbff6ff; // lighter inner detail square
const COLOR_GROUND = 0x12121c;
const COLOR_GROUND_LINE = 0x2ee6ff;
const COLOR_SPIKE = 0xff2e63;
const COLOR_SPIKE_EDGE = 0xff6f9c; // lightened spike outline so teeth read as defined triangles
const COLOR_BLOCK_FILL = 0x1a1a2e;
const COLOR_BLOCK_LINE = 0xffffff;
const COLOR_PORTAL = 0x39ff6a;
const COLOR_ORB = 0xffe14d;
const COLOR_PAD = 0xff7ad9;
const COLOR_INVERT = 0xb14dff; // gravity-invert portal (violet)
const COLOR_RESTORE = 0x2b8cff; // gravity-restore portal (blue)
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
    this.pointerJustDown = false;
    this.pointerHeld = false;
    this.wasGrounded = true;
    this.grounded = true;
    this.vy = 0;
    this.py = 0; // logical player-center y (the GameObject y is the interpolated view)
    this.prevPy = 0;
    this.spin = 0; // logical rotation in degrees
    this.prevSpin = 0;
    this.acc = 0; // fixed-timestep accumulator (ms)
    this.jumpBufferUntil = 0;
    this.prevBottom = 0;
    this.prevTop = 0;
    this.gravityDir = 1; // +1 normal (rest on ground), -1 inverted (rest on ceiling)
    this.portal = null;
    this.portalX = 0;
    this.prevPortalX = 0;
    this.portalSpawned = false;
    this.lastPatternW = 0;
  }

  create() {
    const width = BASE_W;
    const height = BASE_H;
    this.groundTop = height - GROUND_HEIGHT;
    this.ceilingFloor = GROUND_HEIGHT; // inverted-gravity floor (mirror of groundTop)
    this.py = this.groundTop - HALF;
    this.prevPy = this.py;
    this.prevBottom = this.groundTop;
    this.prevTop = this.groundTop - PLAYER_SIZE;
    this.accent = this.cfg.accent || COLOR_BAR;
    this.textRes = getSS(); // rasterize HUD/banner text at backing density so it stays crisp

    // Adaptive supersample: render the 960x540 world across the current backing store.
    this.cameras.main.setZoom(getSS());
    this.cameras.main.centerOn(BASE_W / 2, BASE_H / 2);
    this._fpsFrames = 0;
    this._fpsAccum = 0;

    this.buildBackdrop(width, height);

    const gridKey = 'atlas-grid-w';
    if (!this.textures.exists(gridKey)) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.lineStyle(1, 0xffffff, 1);
      g.strokeRect(0, 0, BLOCK, BLOCK);
      g.generateTexture(gridKey, BLOCK, BLOCK);
      g.destroy();
    }

    // Far parallax layer: sparse dots drifting slower than the grid for depth.
    const farKey = 'atlas-far-w';
    if (!this.textures.exists(farKey)) {
      const fg = this.make.graphics({ x: 0, y: 0, add: false });
      fg.fillStyle(0xffffff, 1);
      fg.fillRect(BLOCK - 2, BLOCK - 2, 2, 2);
      fg.generateTexture(farKey, BLOCK * 2, BLOCK * 2);
      fg.destroy();
    }
    this.farLayer = this.add
      .tileSprite(0, 0, width, this.groundTop, farKey)
      .setOrigin(0, 0)
      .setAlpha(0.08)
      .setDepth(-20);
    this.farLayer.setTint(this.accent);

    this.grid = this.add
      .tileSprite(0, 0, width, this.groundTop, gridKey)
      .setOrigin(0, 0)
      .setAlpha(0.16)
      .setDepth(-10);
    this.grid.setTint(this.accent);

    this.attemptLabel = this.add
      .text(width / 2, this.groundTop * 0.42, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        color: '#33405e',
        resolution: this.textRes,
      })
      .setOrigin(0.5)
      .setDepth(-5);

    this.ground = this.add
      .rectangle(width / 2, this.groundTop + GROUND_HEIGHT / 2, width, GROUND_HEIGHT, COLOR_GROUND)
      .setDepth(-9);
    // Floor grid: the ground band scrolls with the world instead of sitting static.
    this.groundGrid = this.add
      .tileSprite(0, this.groundTop, width, GROUND_HEIGHT, gridKey)
      .setOrigin(0, 0)
      .setAlpha(0.16)
      .setDepth(-8);
    this.groundGrid.setTint(this.accent);
    this.groundLine = this.add.rectangle(width / 2, this.groundTop, width, 4, this.accent).setDepth(-7);
    this.addGlow(this.groundLine, this.accent, 4);

    if (this.cfg.gravity) {
      // Mirror the ground at the top. This band is the floor when gravity is inverted.
      this.add.rectangle(width / 2, GROUND_HEIGHT / 2, width, GROUND_HEIGHT, COLOR_GROUND).setDepth(-9);
      this.ceilGrid = this.add
        .tileSprite(0, 0, width, GROUND_HEIGHT, gridKey)
        .setOrigin(0, 0)
        .setAlpha(0.16)
        .setDepth(-8);
      this.ceilGrid.setTint(this.accent);
      this.ceilLine = this.add.rectangle(width / 2, this.ceilingFloor, width, 4, this.accent).setDepth(-7);
      this.addGlow(this.ceilLine, this.accent, 4);
    }

    // Player cube: a defined GD-style icon (cyan body, dark outline, lighter inner
    // square) as a container so it can spin and squash as one crisp vector unit.
    const body = this.add
      .rectangle(0, 0, PLAYER_SIZE, PLAYER_SIZE, COLOR_PLAYER)
      .setStrokeStyle(4, COLOR_PLAYER_EDGE, 1);
    const inner = this.add
      .rectangle(0, 0, PLAYER_SIZE * 0.42, PLAYER_SIZE * 0.42, COLOR_PLAYER_INNER, 0.95)
      .setStrokeStyle(2, COLOR_PLAYER_EDGE, 0.8);
    this.player = this.add.container(PLAYER_X, this.py, [body, inner]);
    this.player.setSize(PLAYER_SIZE, PLAYER_SIZE);
    this.addGlow(this.player, COLOR_PLAYER, 6);

    if (!this.textures.exists('spark')) {
      const sg = this.make.graphics({ x: 0, y: 0, add: false });
      sg.fillStyle(0xffffff, 1);
      sg.fillCircle(8, 8, 8);
      sg.generateTexture('spark', 16, 16);
      sg.destroy();
    }
    this.trailEmitter = this.add
      .particles(0, 0, 'spark', {
        lifespan: 420,
        speedX: { min: -660, max: -560 }, // stream left at ~world speed for a wake
        speedY: { min: -22, max: 22 },
        scale: { start: 1.0, end: 0 },
        alpha: { start: 0.7, end: 0 },
        tint: COLOR_PLAYER,
        frequency: 8,
        blendMode: 'ADD',
      })
      .setDepth(-1);
    this.trailEmitter.startFollow(this.player);
    this.trailEmitter.stop();

    this.add.rectangle(16, 10, width - 32, 6, COLOR_BAR_BG).setOrigin(0, 0).setDepth(5);
    this.progressBar = this.add.rectangle(16, 10, width - 32, 6, this.accent).setOrigin(0, 0).setDepth(5);
    this.progressBar.scaleX = 0;
    this.levelLabel = this.add
      .text(16, 22, '', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#ffffff', resolution: this.textRes })
      .setDepth(5);
    this.percentLabel = this.add
      .text(width - 16, 22, '0%', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#ffffff', resolution: this.textRes })
      .setOrigin(1, 0)
      .setDepth(5);

    this.banner = this.add
      .text(width / 2, height / 2, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '30px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 8,
        resolution: this.textRes,
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.upKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.menuKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.input.keyboard.addCapture('SPACE,UP,ESC,M');
    this.input.keyboard.on('keydown', () => audio.resume());
    this.input.on('pointerdown', (pointer) => {
      audio.resume();
      // The camera is zoomed by SS, so pointer.x/y live in canvas space; map them into
      // world space before hit-testing the HUD buttons (identity when SS === 1).
      const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      if (this.muteHit && this.muteHit.getBounds().contains(wp.x, wp.y)) {
        audio.toggleMute();
        this.drawMuteIcon();
        return;
      }
      if (this.fsHit && this.fsHit.getBounds().contains(wp.x, wp.y)) {
        this.scale.toggleFullscreen();
        return;
      }
      this.pointerJustDown = true;
      this.pointerHeld = true;
    });
    // Clear the hold on every release or focus loss instead of polling
    // activePointer.isDown, which can stay stuck "down" when a click is released in the
    // dead space outside the canvas or the window loses focus. Polling that stuck flag
    // made a single click bounce forever. pointerupoutside covers the release-outside
    // case; the game BLUR covers alt-tab with the button held.
    const releaseHold = () => {
      this.pointerHeld = false;
    };
    this.input.on('pointerup', releaseHold);
    this.input.on('pointerupoutside', releaseHold);
    const onBlur = () => {
      this.pointerHeld = false;
      this.spaceKey.reset();
      this.upKey.reset();
    };
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, onBlur);
    });

    this.createMuteButton();
    this.createFullscreenButton();
    this.updateHud();
    this.showBanner(this.cfg.name + '\nPress Space or Tap to start\nEsc for menu');
    this.applyCameraFx();
  }

  update(time, delta) {
    if (
      Phaser.Input.Keyboard.JustDown(this.escKey) ||
      Phaser.Input.Keyboard.JustDown(this.menuKey)
    ) {
      audio.stopMusic();
      this.scene.start('MenuScene');
      return;
    }
    const justPressed =
      Phaser.Input.Keyboard.JustDown(this.spaceKey) ||
      Phaser.Input.Keyboard.JustDown(this.upKey) ||
      this.pointerJustDown;
    this.pointerJustDown = false;
    if (justPressed) this.jumpBufferUntil = time + JUMP_BUFFER_MS;
    // pointerHeld is maintained by explicit pointer/blur events (see create) so a
    // released or focus-lost pointer can never read as a permanent hold.
    const holding = this.pointerHeld || this.spaceKey.isDown || this.upKey.isDown;

    this.pulseBackground();

    if (this.gameState === 'running') {
      // Fixed-timestep accumulator: step physics in constant 1/60 slices, then render
      // the player/obstacles/portal interpolated between the last two steps.
      this.acc += Math.min(delta, MAX_CATCHUP);
      while (this.acc >= FIXED_MS && this.gameState === 'running') {
        this.capturePrev();
        this.stepPhysics(FIXED_DT);
        this.acc -= FIXED_MS;
      }
      const alpha = this.gameState === 'running' ? Math.min(this.acc / FIXED_MS, 1) : 1;
      this.present(alpha);

      if (this.gameState === 'running') {
        // Input-driven actions run once per frame against the settled physics state, as
        // before. Hold-to-jump rejumps on every landing; the buffer also lets a fresh
        // tap that landed just before touchdown fire on landing.
        this.tryPads();
        this.tryOrbs(justPressed || holding);
        if (holding || time <= this.jumpBufferUntil) {
          if (this.tryJump()) this.jumpBufferUntil = 0;
        }
        this.scrollDecor(Math.min(delta, MAX_CATCHUP));
        this.perfProbe();
      }
    } else if (justPressed) {
      this.handleMenuPress();
    }
  }

  // Adaptive resolution: average real in-game FPS over a window, then step the
  // supersample up (sharper) only while the device sustains a smooth rate, or down
  // (safety) if it drops. Promotion stops once calibrated; demotion stays armed so a
  // stored tier that turns out too heavy still self-corrects. Cheap: a counter + a
  // periodic average, no per-frame allocation.
  perfProbe() {
    const fps = this.game.loop.actualFps;
    if (!isFinite(fps) || fps <= 0) return;
    this._fpsFrames++;
    this._fpsAccum += fps;
    if (this._fpsFrames < PROBE_WINDOW) return;
    const avg = this._fpsAccum / this._fpsFrames;
    this._fpsFrames = 0;
    this._fpsAccum = 0;

    const idx = SS_LADDER.indexOf(getSS());
    if (avg < FPS_DEMOTE && idx > 0) {
      this.applySS(SS_LADDER[idx - 1]); // struggling: drop a tier
      setCalibrated(true); // the tier below this is the ceiling
    } else if (!isCalibrated() && avg >= FPS_PROMOTE && idx < SS_LADDER.length - 1) {
      this.applySS(SS_LADDER[idx + 1]); // headroom: try sharper, re-measure next window
    } else if (!isCalibrated()) {
      setCalibrated(true); // stable at the current tier: lock it in
    }
  }

  // Switch the live backing-store resolution. World coordinates are unchanged; only the
  // canvas size, camera zoom, and text rasterization density move. One-time cost during
  // calibration, then persisted.
  applySS(ss) {
    setSS(ss);
    this.scale.setGameSize(BASE_W * ss, BASE_H * ss);
    this.cameras.main.setZoom(ss);
    this.cameras.main.centerOn(BASE_W / 2, BASE_H / 2);
    this.textRes = ss;
    for (const t of [this.attemptLabel, this.levelLabel, this.percentLabel, this.banner]) {
      if (t) t.setResolution(ss);
    }
    this._fpsFrames = 0; // re-measure cleanly at the new tier
    this._fpsAccum = 0;
  }

  // Snapshot the interpolated quantities BEFORE a physics step so present() can render
  // the smooth in-between position (curr lerped from prev by the leftover accumulator).
  capturePrev() {
    this.prevPy = this.py;
    this.prevSpin = this.spin;
    this.prevPortalX = this.portalX;
    for (const o of this.obstacles) o.px = o.x;
  }

  // One deterministic physics slice of h seconds. Advances the world, integrates the
  // player, resolves hazards/support, and updates rotation/distance. All collision uses
  // the logical positions (this.py, o.x) so it is identical to the original 60fps loop.
  stepPhysics(h) {
    const dx = SPEED * h;

    // Scroll obstacles, trigger gravity portals, cull off-screen.
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.x -= dx;
      if (o.type === 'gravportal' && !o.triggered && o.x + o.w / 2 <= PLAYER_X) {
        this.gravityDir = o.targetDir;
        o.triggered = true;
        const pc = o.targetDir === -1 ? COLOR_INVERT : COLOR_RESTORE;
        this.burst(PLAYER_X, this.py, pc, 26, 280, 560);
        this.cameras.main.flash(140, (pc >> 16) & 255, (pc >> 8) & 255, pc & 255);
        audio.flip();
      }
      if (o.x + o.w < 0) {
        for (const part of o.gos) part.go.destroy();
        this.obstacles.splice(i, 1);
      }
    }

    // Scroll the finish portal; reaching the player completes the level.
    if (this.portal) {
      this.portalX -= dx;
      if (this.portalX <= PLAYER_X) {
        this.completeLevel();
        return;
      }
    }

    // Manual kinematic player (gravity + jump arc under our control).
    // gravityDir +1 = normal (fall down, rest on ground); -1 = inverted (rest on ceiling).
    this.vy += GRAVITY * this.gravityDir * h;
    this.py += this.vy * h;
    if (this.gravityDir === 1) {
      if (this.py < HALF) {
        this.py = HALF;
        this.vy = 0;
      }
    } else {
      const maxY = BASE_H - HALF;
      if (this.py > maxY) {
        this.py = maxY;
        this.vy = 0;
      }
    }
    const bottom = this.py + HALF;
    const top = this.py - HALF;

    // Resolve hazards + figure out the surface under the player this frame.
    const hurt = this.playerHurtBox();
    const footL = PLAYER_X - (HALF - 2);
    const footR = PLAYER_X + (HALF - 2);
    let supportTop = this.groundTop; // normal floor (gravityDir +1)
    let supportBottom = this.ceilingFloor; // inverted floor (gravityDir -1)

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
      } else if (o.type === 'platform') {
        const overlapX = footR > o.x && footL < o.x + o.w;
        if (overlapX) {
          if (this.prevBottom <= o.top + LAND_EPS) {
            supportTop = Math.min(supportTop, o.top); // land on / ride the platform
          } else if (hurt.bottom > o.top && hurt.top < o.top + o.h) {
            this.die(); // hit the side or underside
            return;
          }
          // otherwise the player passes safely underneath
        }
      } else if (o.type === 'ceiling') {
        const cr = new Phaser.Geom.Rectangle(o.x, 0, o.w, o.lethalBottom);
        if (Phaser.Geom.Intersects.RectangleToRectangle(hurt, cr)) {
          this.die();
          return;
        }
      }
    }

    if (this.gravityDir === 1) {
      if (bottom >= supportTop) {
        this.py = supportTop - HALF;
        this.vy = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    } else {
      if (top <= supportBottom) {
        this.py = supportBottom + HALF;
        this.vy = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }
    this.prevBottom = this.py + HALF;
    this.prevTop = this.py - HALF;

    // Rotation: spin while airborne; snap to a clean quarter-turn on landing.
    if (!this.grounded) {
      this.spin += SPIN_RATE * this.gravityDir * h;
    } else if (!this.wasGrounded) {
      this.spin = Math.round(this.spin / 90) * 90;
      this.squashStretch(1.16, 0.86); // squash on landing
      audio.land();
    }
    this.wasGrounded = this.grounded;

    this.distance += dx;
    this.updateHud();
    this.maybeSpawnPortal();
  }

  // Apply the interpolated view positions. alpha is the leftover-accumulator fraction
  // between the last two physics steps, so the cube and obstacles glide smoothly at any
  // refresh rate while collisions stay locked to the fixed step.
  present(alpha) {
    this.player.y = this.prevPy + (this.py - this.prevPy) * alpha;
    this.player.angle = this.prevSpin + (this.spin - this.prevSpin) * alpha;
    for (const o of this.obstacles) {
      const px = o.px == null ? o.x : o.px;
      const x = px + (o.x - px) * alpha;
      for (const part of o.gos) part.go.x = x + part.dx;
    }
    if (this.portal) {
      const px = this.prevPortalX == null ? this.portalX : this.prevPortalX;
      this.portal.x = px + (this.portalX - px) * alpha;
    }
  }

  // Scroll the decorative grids by wall-clock delta (they carry no collision, so this
  // is smooth at any refresh without interpolation). Same SPEED as the world.
  scrollDecor(ms) {
    const dx = SPEED * (ms / 1000);
    this.grid.tilePositionX += dx;
    if (this.groundGrid) this.groundGrid.tilePositionX += dx;
    if (this.ceilGrid) this.ceilGrid.tilePositionX += dx;
    if (this.farLayer) this.farLayer.tilePositionX += dx * 0.35;
  }

  playerHurtBox() {
    const h = HALF - 6; // forgiving 28x28 box, independent of the cube's spin
    return new Phaser.Geom.Rectangle(PLAYER_X - h, this.py - h, h * 2, h * 2);
  }

  // Lethal zone is the lower-center of the spike, so clearing the apex is safe.
  spikeHitBox(o) {
    const hitW = Math.min(20, o.w * 0.5);
    const hitH = o.h * 0.55;
    const hx = o.x + (o.w - hitW) / 2;
    if (o.inverted) return new Phaser.Geom.Rectangle(hx, this.ceilingFloor, hitW, hitH);
    return new Phaser.Geom.Rectangle(hx, this.groundTop - hitH, hitW, hitH);
  }

  // Drive the on-beat flash from the real audio scheduler so it lands on the kick.
  pulseBackground() {
    const ph = audio.beatPhase ? audio.beatPhase() : 0;
    const flash = ph > 0 ? 1 - ph : 0; // bright on the downbeat, decaying to the next
    if (this.pulseOverlay) this.pulseOverlay.alpha = 0.06 * flash;
    const lineA = 0.7 + 0.3 * flash;
    if (this.groundLine) this.groundLine.fillAlpha = lineA;
    if (this.ceilLine) this.ceilLine.fillAlpha = lineA;
  }

  tryJump() {
    if (this.grounded) {
      this.vy = JUMP_V * this.gravityDir;
      this.grounded = false;
      this.squashStretch(0.86, 1.16); // stretch on takeoff
      audio.jump();
      return true;
    }
    return false;
  }

  // Subtle squash/stretch (visual only; never touches the hurt box). Snap to the
  // target scale, then ease back to 1 with a little overshoot.
  squashStretch(sx, sy) {
    if (this.squashTween) this.squashTween.stop();
    this.player.setScale(sx, sy);
    this.squashTween = this.tweens.add({
      targets: this.player,
      scaleX: 1,
      scaleY: 1,
      duration: 150,
      ease: 'Back.out',
    });
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
    this.py = this.groundTop - HALF;
    this.prevPy = this.py;
    this.spin = 0;
    this.prevSpin = 0;
    this.acc = 0;
    this.jumpBufferUntil = 0;
    this.gravityDir = 1;
    this.grounded = true;
    this.wasGrounded = true;
    this.attempts += 1;
    this.attemptLabel.setText('Attempt ' + this.attempts);
    this.hideBanner();
    if (this.trailEmitter) this.trailEmitter.start();
    audio.startMusic();
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
    const x = BASE_W + 20;
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
    if (key === 'platform') {
      // Low floating platform: jump on, ride at height, drop off (elevation change).
      const bw = Phaser.Math.Between(150, 200);
      this.addPlatform(x, bw, PLAT_LOW);
      return bw;
    }
    if (key === 'highPlatform') {
      // A ground step, then a high platform you can only reach by jumping off it.
      this.addBlock(x, 80, BLOCK);
      this.addPlatform(x + 160, 160, PLAT_HIGH);
      return 320;
    }
    if (key === 'ceiling') {
      // Downward spikes from the top: pass under by staying grounded (no jumping).
      const cw = Phaser.Math.Between(240, 300);
      this.addCeiling(x, cw);
      return cw;
    }
    if (key === 'orbGap') {
      // A spike pit too wide for one jump. Logic: jump, tap the orb mid-air for a
      // second jump, clear the rest. No orb, no crossing.
      const n = 9;
      for (let i = 0; i < n; i++) this.addSpike(x + i * SPIKE_W);
      this.addOrb(x + 170, this.groundTop - 95);
      return n * SPIKE_W;
    }
    if (key === 'padWall') {
      // A wall too tall to jump. Logic: stay grounded onto the pad, get launched
      // over it. Bounce past the pad and you smack the wall.
      this.addPad(x, 64);
      this.addCapped(x + 200, 110, 20);
      return 240;
    }
    if (key === 'flipHop') {
      // Invert gravity, run on the ceiling, jump (downward) over one ceiling spike,
      // then restore. Runways sized to the measured 258px gravity transit (280 = margin).
      this.addGravityPortal(x + 40, -1);
      this.addSpike(x + 320, SPIKE_H, true);
      this.addGravityPortal(x + 620, 1);
      return 900;
    }
    if (key === 'flipLane') {
      // Invert gravity so the ceiling is the only safe lane past a near-full-height wall,
      // then restore. Logic: stay grounded on the ceiling, do NOT bounce into the wall.
      this.addGravityPortal(x + 40, -1);
      for (let i = 0; i < 3; i++) this.addCapped(x + 320 + i * BLOCK, 316, 24); // 340 tall
      this.addGravityPortal(x + 560, 1);
      return 840;
    }
    this.addSpike(x);
    return SPIKE_W;
  }

  addSpike(x, h = SPIKE_H, inverted = false) {
    const w = SPIKE_W;
    let tri, top;
    if (inverted) {
      // Mounted on the ceiling floor, apex pointing down into the arena.
      top = this.ceilingFloor;
      tri = this.add.triangle(x, top, 0, 0, w, 0, w / 2, h, COLOR_SPIKE).setOrigin(0, 0);
    } else {
      top = this.groundTop - h;
      tri = this.add.triangle(x, top, 0, h, w, h, w / 2, 0, COLOR_SPIKE).setOrigin(0, 0);
    }
    tri.setStrokeStyle(2, COLOR_SPIKE_EDGE, 1);
    this.addGlow(tri, COLOR_SPIKE, 3);
    this.obstacles.push({ type: 'spike', x, w, h, top, inverted, gos: [{ go: tri, dx: 0 }] });
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
    s1.setStrokeStyle(2, COLOR_SPIKE_EDGE, 1);
    s2.setStrokeStyle(2, COLOR_SPIKE_EDGE, 1);
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

  addPlatform(x, w, hAbove) {
    const top = this.groundTop - hAbove;
    const rect = this.add.rectangle(x, top, w, PLAT_T, COLOR_BLOCK_FILL).setOrigin(0, 0);
    rect.setStrokeStyle(2, COLOR_BLOCK_LINE, 1);
    this.addGlow(rect, COLOR_BLOCK_LINE, 2);
    this.obstacles.push({ type: 'platform', x, w, h: PLAT_T, top, gos: [{ go: rect, dx: 0 }] });
  }

  addCeiling(x, w) {
    const lethalBottom = this.groundTop - CEIL_CLEAR;
    const teethH = 26;
    const bodyH = lethalBottom - teethH;
    const body = this.add.rectangle(x, 0, w, bodyH, COLOR_BLOCK_FILL).setOrigin(0, 0);
    body.setStrokeStyle(2, COLOR_SPIKE, 0.9);
    this.addGlow(body, COLOR_SPIKE, 2);
    const gos = [{ go: body, dx: 0 }];
    const n = Math.max(1, Math.round(w / 30));
    const step = w / n;
    for (let i = 0; i < n; i++) {
      const tooth = this.add
        .triangle(x + i * step, bodyH, 0, 0, step, 0, step / 2, teethH, COLOR_SPIKE)
        .setOrigin(0, 0);
      tooth.setStrokeStyle(2, COLOR_SPIKE_EDGE, 1);
      gos.push({ go: tooth, dx: i * step });
    }
    this.obstacles.push({ type: 'ceiling', x, w, h: lethalBottom, top: 0, lethalBottom, gos });
  }

  addOrb(ox, oy) {
    const c = this.add.circle(ox, oy, ORB_R, COLOR_ORB, 0.22);
    c.setStrokeStyle(3, COLOR_ORB, 1);
    this.addGlow(c, COLOR_ORB, 4);
    this.obstacles.push({ type: 'orb', x: ox - ORB_R, w: ORB_R * 2, top: oy - ORB_R, used: false, gos: [{ go: c, dx: ORB_R }] });
  }

  addPad(x, w) {
    const h = 12;
    const top = this.groundTop - h;
    const rect = this.add.rectangle(x, top, w, h, COLOR_PAD).setOrigin(0, 0);
    this.addGlow(rect, COLOR_PAD, 5);
    this.obstacles.push({ type: 'pad', x, w, top, h, used: false, gos: [{ go: rect, dx: 0 }] });
  }

  // Gravity portal: non-lethal gate that sets gravityDir when its center reaches the
  // player (-1 = invert / run on the ceiling, +1 = restore normal). Idempotent.
  addGravityPortal(x, dir) {
    const color = dir === -1 ? COLOR_INVERT : COLOR_RESTORE;
    const w = 26;
    const top = this.ceilingFloor;
    const h = this.groundTop - this.ceilingFloor;
    const gate = this.add.rectangle(x, top + h / 2, w, h, color, 0.18);
    gate.setStrokeStyle(3, color, 1);
    this.addGlow(gate, color, 6);
    this.obstacles.push({
      type: 'gravportal',
      x: x - w / 2,
      w,
      top,
      targetDir: dir,
      triggered: false,
      gos: [{ go: gate, dx: w / 2 }],
    });
  }

  // Jump orb: a jump input while overlapping gives one mid-air jump per pass.
  tryOrbs(jumpInput) {
    const hurt = this.playerHurtBox();
    for (const o of this.obstacles) {
      if (o.type !== 'orb') continue;
      const box = new Phaser.Geom.Rectangle(o.x, o.top, o.w, o.w);
      const over = Phaser.Geom.Intersects.RectangleToRectangle(hurt, box);
      if (over && jumpInput && !o.used) {
        this.vy = JUMP_V * this.gravityDir;
        this.grounded = false;
        o.used = true;
        this.burst(o.x + o.w / 2, o.top + o.w / 2, COLOR_ORB, 14, 200, 420);
        audio.orb();
      } else if (!over) {
        o.used = false;
      }
    }
  }

  // Jump pad: touching one while grounded super-launches you, no input needed.
  tryPads() {
    const footL = PLAYER_X - (HALF - 2);
    const footR = PLAYER_X + (HALF - 2);
    const onGround =
      this.gravityDir === 1
        ? this.py + HALF >= this.groundTop - 16
        : this.py - HALF <= this.ceilingFloor + 16;
    for (const o of this.obstacles) {
      if (o.type !== 'pad') continue;
      const overlapX = footR > o.x && footL < o.x + o.w;
      if (overlapX && onGround && !o.used) {
        this.vy = PAD_V * this.gravityDir;
        this.grounded = false;
        o.used = true;
        this.burst(PLAYER_X, this.py, COLOR_PAD, 18, 300, 460);
        audio.pad();
      } else if (!overlapX) {
        o.used = false;
      }
    }
  }

  maybeSpawnPortal() {
    if (this.portalSpawned) return;
    const remaining = this.cfg.goal - this.distance;
    if (remaining <= BASE_W - PLAYER_X) {
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
    this.portalX = x;
    this.prevPortalX = x;
  }

  die() {
    this.gameState = 'dead';
    this.vy = 0;
    audio.die();
    audio.stopMusic();
    if (this.trailEmitter) this.trailEmitter.stop();
    this.burst(PLAYER_X, this.py, COLOR_SPIKE, 40, 360, 720);
    this.burst(PLAYER_X, this.py, COLOR_PLAYER, 20, 220, 720);
    this.player.setVisible(false);
    this.cameras.main.shake(320, 0.02);
    this.cameras.main.flash(160, 255, 46, 99);
    this.showBanner('Game Over\n' + this.cfg.name + '\nPress Space or Tap to retry\nEsc for menu');
  }

  completeLevel() {
    this.vy = 0;
    audio.complete();
    audio.stopMusic();
    if (this.trailEmitter) this.trailEmitter.stop();
    this.burst(PLAYER_X, this.py, this.accent, 54, 380, 900);
    this.cameras.main.flash(200, 255, 255, 255);
    if (this.levelIndex + 1 < LEVELS.length) {
      this.gameState = 'complete';
      this.showBanner(this.cfg.name + ' complete\nPress Space or Tap to continue\nEsc for menu');
    } else {
      this.gameState = 'won';
      this.progressBar.scaleX = 1;
      this.percentLabel.setText('100%');
      this.showBanner('AtlasDash complete\nYou cleared every level\nPress Space or Tap to play again\nEsc for menu');
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

  // Synthwave backdrop: gradient sky, outrun sun, skyline silhouette, breathing glow.
  // All dim/desaturated and behind the play plane so hazards stay readable.
  buildBackdrop(width, height) {
    const horizon = Math.round(height * 0.46);
    const sky = this.add.graphics().setDepth(-30);
    const mid = mix(0x150b2e, this.accent, 0.12);
    sky.fillGradientStyle(COLOR_BG, COLOR_BG, mid, mid, 1);
    sky.fillRect(0, 0, width, horizon);
    sky.fillGradientStyle(mid, mid, 0x09060f, 0x09060f, 1);
    sky.fillRect(0, horizon, width, height - horizon);

    this.buildSun(width / 2, Math.round(height * 0.3), 66);

    const sl = this.add.graphics().setDepth(-26);
    sl.fillStyle(mix(0x0d0a1a, this.accent, 0.06), 1);
    let x = -10;
    while (x < width + 10) {
      const w = 18 + ((x * 37) % 46);
      const h = 8 + ((x * 13) % 30);
      sl.fillRect(x, horizon - h, w + 1, h);
      x += w;
    }

    this.pulseOverlay = this.add
      .rectangle(0, 0, width, height, this.accent, 0)
      .setOrigin(0, 0)
      .setDepth(-25);
  }

  buildSun(cx, cy, r) {
    const col = mix(this.accent, 0xff9d5c, 0.35);
    const g = this.add.graphics().setDepth(-28);
    g.fillStyle(col, 0.5);
    const step = 4;
    for (let y = -r; y <= r; y += step) {
      if (y > r * 0.2 && Math.floor(y / step) % 2 === 0) continue; // outrun scanline gaps
      const hw = Math.sqrt(Math.max(0, r * r - y * y));
      g.fillRect(cx - hw, cy + y, hw * 2, step - 1);
    }
    this.addGlow(g, col, 3);
  }

  // One-shot particle burst at (x,y); cleans itself up after the particles fade.
  burst(x, y, color, count, speed = 260, lifespan = 600) {
    const e = this.add
      .particles(x, y, 'spark', {
        lifespan,
        speed: { min: speed * 0.25, max: speed },
        scale: { start: 0.95, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: color,
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(3);
    e.explode(count);
    this.time.delayedCall(lifespan + 80, () => e.destroy());
  }

  // Camera-level grading: one cheap full-screen pass each. Gated for canvas fallback.
  applyCameraFx() {
    try {
      const cam = this.cameras.main;
      if (!cam.postFX) return;
      if (cam.postFX.addBloom) cam.postFX.addBloom(0xffffff, 1, 1, 1.1, 0.55, 4);
      if (cam.postFX.addVignette) cam.postFX.addVignette(0.5, 0.52, 0.78, 0.4);
      if (cam.postFX.addColorMatrix) cam.postFX.addColorMatrix().saturate(0.2);
    } catch (e) {
      /* No WebGL postFX available; plain fills still render. */
    }
  }

  showBanner(text) {
    this.banner.setText(text).setVisible(true);
  }

  hideBanner() {
    this.banner.setVisible(false);
  }

  // Clickable speaker toggle (bottom-right; top-right HUD is taken by the percent
  // label). Click handling lives in the scene pointerdown so it never doubles as a
  // jump. State persists on the audio singleton, so it survives scene changes.
  createMuteButton() {
    const x = BASE_W - 24;
    const y = BASE_H - 22;
    this.muteG = this.add.graphics().setDepth(6);
    this.muteHit = this.add.rectangle(x, y, 36, 30, 0x000000, 0.001).setDepth(6);
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
  // browser supports the Fullscreen API (iPhone Safari does not; those players
  // use Add to Home Screen instead). Hit-tested in the scene pointerdown above
  // so a tap never doubles as a jump.
  createFullscreenButton() {
    if (!this.scale.fullscreen || !this.scale.fullscreen.available) return;
    const x = BASE_W - 64;
    const y = BASE_H - 22;
    this.fsG = this.add.graphics().setDepth(6);
    this.fsHit = this.add.rectangle(x, y, 36, 30, 0x000000, 0.001).setDepth(6);
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

function mix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}
