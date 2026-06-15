// Procedural Web Audio engine for AtlasDash.
// No audio files: every SFX and the music loop are synthesized live so the game
// keeps its instant, zero-download load. A single shared singleton (one
// AudioContext, master/music/sfx gain buses, a persistent mute flag) is imported
// by MenuScene and GameScene. Autoplay policy: the context is created/resumed only
// on the first user gesture; music starts only after that.

const MASTER_GAIN = 0.9;
const MUSIC_GAIN = 0.5;
const SFX_GAIN = 0.8;
const MAX_SFX_VOICES = 16; // runaway guard for SFX only (music is self-bounded)

const BPM = 130;
const SIXTEENTH = 60 / BPM / 4; // seconds per 16th note (~0.11538s)
const STEPS = 64; // 4 bars * 16 sixteenths
const LOOKAHEAD_MS = 25; // scheduler tick
const SCHEDULE_AHEAD = 0.1; // seconds of notes to queue each tick

// Frequency from a semitone offset relative to A4 (440 Hz).
function hz(semis) {
  return 440 * Math.pow(2, semis / 12);
}

// 4-bar minor progression (A minor feel): Am, F, C, G.
const BASS_ROOTS = [-24, -28, -21, -26]; // A2, F2, C3, G2 (semitones from A4)
const ARP_POOLS = [
  [-12, -9, -5, 0], // Am: A3 C4 E4 A4
  [-16, -12, -9, -4], // F:  F3 A3 C4 F4
  [-9, -5, -2, 3], // C:  C4 E4 G4 C5
  [-14, -10, -7, -2], // G:  G3 B3 D4 G4
];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;
    this.sfxVoices = 0;
    this.muted = false;
    try {
      this.muted = localStorage.getItem('atlas-muted') === '1';
    } catch (e) {
      /* private mode: default unmuted */
    }
    this.wantMusic = false;
    this.schedulerId = null;
    this.nextNoteTime = 0;
    this.step = 0;
    this._visBound = false;
    // Beat sync: the visuals read beatPhase() to flash on the AUDIBLE kick (beats 1 &
    // 3, eight 16ths apart) instead of a free-running sine that drifts off the music.
    this.lastBeatTime = 0;
    this.beatInterval = SIXTEENTH * 8;
  }

  // 0..1 phase since the most recent kick that has actually been scheduled to sound.
  // 0 right on the downbeat, rising to 1 just before the next. Returns 0 when no music
  // is playing so the pulse simply rests. Robust to the scheduler queuing slightly
  // ahead of currentTime (since can go negative for a few ms).
  beatPhase() {
    if (!this.wantMusic || !this.ctx || !this.lastBeatTime) return 0;
    let since = this.ctx.currentTime - this.lastBeatTime;
    if (since < 0) since += this.beatInterval;
    const ph = (since % this.beatInterval) / this.beatInterval;
    return ph < 0 ? 0 : ph > 1 ? 1 : ph;
  }

  // Build the graph once. Safe to call repeatedly (no-op after the first time).
  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = MUSIC_GAIN;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = SFX_GAIN;
    this.sfxGain.connect(this.master);

    this._buildNoise();

    if (!this._visBound) {
      this._visBound = true;
      document.addEventListener('visibilitychange', () => this._onVisibility());
    }
  }

  // Call on the first key/pointer in each scene.
  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _buildNoise() {
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  // --- mute --------------------------------------------------------------
  setMuted(b) {
    this.muted = b;
    try {
      localStorage.setItem('atlas-muted', b ? '1' : '0');
    } catch (e) {
      /* private mode: in-memory only */
    }
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(b ? 0 : MASTER_GAIN, t + 0.05);
    }
    return this.muted;
  }

  toggleMute() {
    return this.setMuted(!this.muted);
  }

  // --- low-level voices --------------------------------------------------
  // An oscillator with an optional linear freq glide and an ADSR-ish gain
  // envelope. Exponential ramps cannot reach 0, so we floor at 0.0001 and let
  // the node stop. `count` gates SFX against the voice cap; music passes false.
  _tone(o) {
    if (!this.ctx || this.ctx.state === 'closed') return;
    const count = o.count !== false;
    if (count && this.sfxVoices >= MAX_SFX_VOICES) return;
    const ctx = this.ctx;
    const when = o.when != null ? o.when : ctx.currentTime;
    const dur = o.dur;
    const attack = o.attack != null ? o.attack : 0.004;
    const peak = o.peak != null ? o.peak : 0.4;
    const bus = o.bus || this.sfxGain;

    const osc = ctx.createOscillator();
    osc.type = o.type || 'triangle';
    if (o.detune) osc.detune.value = o.detune;
    osc.frequency.setValueAtTime(o.f0, when);
    if (o.f1 != null && o.f1 !== o.f0) osc.frequency.linearRampToValueAtTime(o.f1, when + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    if (o.filterType) {
      const f = ctx.createBiquadFilter();
      f.type = o.filterType;
      f.Q.value = o.filterQ != null ? o.filterQ : 1;
      f.frequency.setValueAtTime(o.filterF0 != null ? o.filterF0 : o.f0, when);
      if (o.filterF1 != null) f.frequency.linearRampToValueAtTime(o.filterF1, when + dur);
      osc.connect(f);
      f.connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(bus);

    if (count) {
      this.sfxVoices++;
      osc.onended = () => {
        this.sfxVoices--;
        try {
          g.disconnect();
        } catch (e) {
          /* already gone */
        }
      };
    } else {
      osc.onended = () => {
        try {
          g.disconnect();
        } catch (e) {
          /* already gone */
        }
      };
    }
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  // Filtered white-noise burst (hats, snares, explosions, ticks).
  _noise(o) {
    if (!this.ctx || this.ctx.state === 'closed' || !this.noiseBuffer) return;
    const count = o.count !== false;
    if (count && this.sfxVoices >= MAX_SFX_VOICES) return;
    const ctx = this.ctx;
    const when = o.when != null ? o.when : ctx.currentTime;
    const dur = o.dur;
    const peak = o.peak != null ? o.peak : 0.4;
    const bus = o.bus || this.sfxGain;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const f = ctx.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.Q.value = o.q != null ? o.q : 1;
    f.frequency.setValueAtTime(o.f0 != null ? o.f0 : 2000, when);
    if (o.f1 != null) f.frequency.linearRampToValueAtTime(o.f1, when + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    src.connect(f);
    f.connect(g);
    g.connect(bus);

    if (count) {
      this.sfxVoices++;
      src.onended = () => {
        this.sfxVoices--;
        try {
          g.disconnect();
        } catch (e) {
          /* already gone */
        }
      };
    } else {
      src.onended = () => {
        try {
          g.disconnect();
        } catch (e) {
          /* already gone */
        }
      };
    }
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  // --- SFX ---------------------------------------------------------------
  jump() {
    this._tone({ type: 'triangle', f0: 520, f1: 780, dur: 0.13, peak: 0.5 });
  }

  land() {
    this._tone({ type: 'sine', f0: 180, f1: 90, dur: 0.14, peak: 0.45, filterType: 'lowpass', filterF0: 400 });
    this._noise({ dur: 0.02, peak: 0.15, type: 'highpass', f0: 2000 });
  }

  die() {
    this._noise({ dur: 0.45, peak: 0.6, type: 'lowpass', f0: 3000, f1: 200 });
    this._tone({ type: 'sawtooth', f0: 300, f1: 60, dur: 0.4, peak: 0.4, filterType: 'lowpass', filterF0: 1200 });
  }

  orb() {
    this._tone({ type: 'triangle', f0: 1180, f1: 1320, dur: 0.18, peak: 0.4, filterType: 'highpass', filterF0: 800 });
  }

  pad() {
    this._tone({
      type: 'sawtooth', f0: 220, f1: 880, dur: 0.28, peak: 0.5, attack: 0.01,
      filterType: 'bandpass', filterF0: 300, filterF1: 1400, filterQ: 4,
    });
    this._noise({ dur: 0.2, peak: 0.2, type: 'highpass', f0: 1000 });
  }

  flip() {
    this._tone({ type: 'sawtooth', f0: 480, dur: 0.3, peak: 0.4, attack: 0.02, detune: 7, filterType: 'lowpass', filterF0: 2000 });
    this._tone({ type: 'sawtooth', f0: 480, dur: 0.3, peak: 0.4, attack: 0.02, detune: -7, filterType: 'lowpass', filterF0: 2000 });
    this._tone({ type: 'triangle', f0: 960, dur: 0.3, peak: 0.2 });
  }

  complete() {
    if (!this.ctx) return;
    const notes = [440, 523.25, 659.25, 880];
    const now = this.ctx.currentTime;
    notes.forEach((f, i) => this._tone({ type: 'triangle', f0: f, dur: 0.18, peak: 0.4, when: now + i * 0.09 }));
  }

  uiMove() {
    this._tone({ type: 'square', f0: 660, dur: 0.05, peak: 0.25 });
  }

  uiSelect() {
    this._tone({ type: 'square', f0: 520, f1: 780, dur: 0.12, peak: 0.3 });
  }

  // --- music (130 BPM synthwave loop) ------------------------------------
  startMusic() {
    this.ensure();
    if (!this.ctx) return;
    this.wantMusic = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    // Restore the music bus (stopMusic ramps it to ~0 to avoid a tail on retry).
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setValueAtTime(MUSIC_GAIN, t);
    if (this.schedulerId == null) {
      this.step = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.06;
      this.schedulerId = setInterval(() => this._tick(), LOOKAHEAD_MS);
    }
  }

  stopMusic() {
    this.wantMusic = false;
    if (this.schedulerId != null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    if (this.ctx && this.musicGain) {
      const t = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
      this.musicGain.gain.linearRampToValueAtTime(0.0001, t + 0.05);
    }
  }

  _tick() {
    if (!this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      this._scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += SIXTEENTH;
      this.step = (this.step + 1) % STEPS;
    }
  }

  _scheduleStep(step, when) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const m = this.musicGain;

    // Bass: root on every 8th, octave-up accent on the off-beat 8th.
    if (s % 2 === 0) {
      const n = s % 4 === 2 ? BASS_ROOTS[bar] + 12 : BASS_ROOTS[bar];
      this._tone({ type: 'sawtooth', f0: hz(n), dur: 0.1, peak: 0.5, bus: m, count: false, filterType: 'lowpass', filterF0: 700 });
    }
    // Arp: rolling 16th-note arpeggio over the chord tones.
    const a = ARP_POOLS[bar][s % 4];
    this._tone({ type: 'square', f0: hz(a), dur: 0.09, peak: 0.22, bus: m, count: false, filterType: 'lowpass', filterF0: 2500 });
    // Kick on beats 1 & 3.
    if (s === 0 || s === 8) {
      this._tone({ type: 'sine', f0: 120, f1: 50, dur: 0.12, peak: 0.7, bus: m, count: false });
      this.lastBeatTime = when; // drives the on-beat visual pulse (beatPhase)
    }
    // Snare on beats 2 & 4.
    if (s === 4 || s === 12) {
      this._noise({ dur: 0.12, peak: 0.35, type: 'bandpass', f0: 1800, q: 1.2, bus: m, count: false });
    }
    // Hat on every off-beat 16th.
    if (s % 2 === 1) {
      this._noise({ dur: 0.03, peak: 0.12, type: 'highpass', f0: 7000, bus: m, count: false });
    }
  }

  _onVisibility() {
    if (!this.ctx) return;
    if (document.hidden) {
      if (this.schedulerId != null) {
        clearInterval(this.schedulerId);
        this.schedulerId = null;
      }
      if (this.ctx.state === 'running') this.ctx.suspend();
    } else if (this.wantMusic) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (this.schedulerId == null) {
        this.nextNoteTime = this.ctx.currentTime + 0.06;
        this.schedulerId = setInterval(() => this._tick(), LOOKAHEAD_MS);
      }
    }
  }
}

export const audio = new AudioEngine();
