// Shared render constants + adaptive supersampling state.
//
// The whole game is authored in a fixed 960x540 WORLD coordinate system. Supersampling
// renders that world into a larger backing store (canvas = BASE*SS) with each scene's
// camera zoomed by SS, so vector edges and text get crisper WITHOUT changing any
// gameplay number. The camera math is a no-op at SS=1.
//
// SS is ADAPTIVE, not fixed. A flat SS=2 quadruples fill rate and makes every per-object
// glow + the camera bloom pass 4x more expensive, which dropped frames on weaker
// devices. So we boot at native SS=1 (always fast) and let GameScene measure real
// in-game FPS, stepping SS UP the ladder only while the device sustains a smooth frame
// rate and stepping it DOWN the moment it can't. The chosen value is persisted per
// browser so the calibration only happens once.
export const BASE_W = 960;
export const BASE_H = 540;

// Supersample tiers, lowest (native, fastest) first. 1.5 -> 1440x810, 2 -> 1920x1080.
export const SS_LADDER = [1, 1.5, 2];

const KEY_SS = 'atlas-ss';
const KEY_CAL = 'atlas-ss-cal';

function snapToLadder(v) {
  let best = SS_LADDER[0];
  for (const s of SS_LADDER) if (Math.abs(s - v) < Math.abs(best - v)) best = s;
  return best;
}

function readStored() {
  try {
    const v = parseFloat(localStorage.getItem(KEY_SS));
    return isNaN(v) ? 1 : snapToLadder(v);
  } catch (e) {
    return 1; // private mode / no storage: native
  }
}

let _ss = readStored();
let _calibrated = (() => {
  try {
    return localStorage.getItem(KEY_CAL) === '1';
  } catch (e) {
    return false;
  }
})();

export function getSS() {
  return _ss;
}

export function setSS(v) {
  _ss = v;
  try {
    localStorage.setItem(KEY_SS, String(v));
  } catch (e) {
    /* in-memory only */
  }
}

export function isCalibrated() {
  return _calibrated;
}

export function setCalibrated(b) {
  _calibrated = b;
  try {
    localStorage.setItem(KEY_CAL, b ? '1' : '0');
  } catch (e) {
    /* in-memory only */
  }
}
