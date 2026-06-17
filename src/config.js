// Shared render constants.
//
// The whole game is authored in a fixed 960x540 WORLD coordinate system, so every
// layout and physics constant is written against it. SS is a supersample factor: the
// canvas is sized to BASE*SS and each scene zooms its camera by SS, so the world maps
// across a higher-resolution backing store (crisper vector edges + text) WITHOUT
// changing any gameplay number. The camera math is a no-op at SS=1.
//
// SS is 1 (native 960x540). It was briefly 2 (1920x1080), but that quadruples fill
// rate and, crucially, makes every per-object glow and the camera bloom pass 4x more
// expensive, which dropped the frame rate on both desktop and mobile. Smoothness wins
// over a sharper-but-janky picture, so SS stays at 1. The supersample plumbing is kept
// so it can be re-enabled adaptively later (e.g. only on devices that sustain 60fps).
export const BASE_W = 960;
export const BASE_H = 540;
export const SS = 1;
