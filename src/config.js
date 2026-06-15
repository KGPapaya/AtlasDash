// Shared render constants.
//
// The whole game is authored in a fixed 960x540 WORLD coordinate system, so every
// layout and physics constant is written against it. To stop that world from being
// bilinearly upscaled (and going soft) on displays wider than 960px, we render it
// into a larger backing store and zoom each scene's camera by the same factor:
//   - main.js sizes the canvas to BASE_W*SS x BASE_H*SS (the real pixels the GPU draws)
//   - each scene calls camera.setZoom(SS) + centerOn(BASE_W/2, BASE_H/2)
// so world (0..960, 0..540) maps exactly across the high-res canvas. Vector shapes
// and (resolution-bumped) text then rasterize at native density = crisp edges, while
// not a single gameplay number changes.
//
// SS is fixed at 2 (1920x1080 backing). That is sharp on every common display and
// caps per-pixel fill-rate (bloom/glow run on every pixel) so dense mobile GPUs stay
// smooth; going higher buys little and risks frame drops.
export const BASE_W = 960;
export const BASE_H = 540;
export const SS = 2;
