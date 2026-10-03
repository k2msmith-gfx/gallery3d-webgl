# Gallery3D WebGL

A first-person 3D gallery demo written directly against **WebGL2** (no
engine, no build step — plain JS modules + GLSL) as a from-scratch sibling
to an earlier [macroquad/Rust version](https://github.com/k2msmith-gfx/gallery3d).
Walk through 3 color-themed rooms and view a sampling of renders from a ray
tracer project, lit in real time rather than pre-baked.

**[Play it in your browser »](https://k2msmith-gfx.github.io/gallery3d-webgl/)**

## Controls

- **Up / Down** — walk forward / backward
- **Left / Right** — turn
- On touch devices, on-screen buttons in the bottom corners do the same.

## What's different from the macroquad version

macroquad's 3D pipeline has no built-in lighting, so that version baked
ambient + point-light shading into vertex colors on the CPU. This rewrite
does real per-pixel lighting instead:

- **Blinn-Phong lighting** (ambient + diffuse + specular) evaluated per
  fragment against up to 16 point lights (a ceiling light per room, plus a
  spotlight over each painting).
- **Tangent-space normal mapping** on every surface — plaster walls, wood
  plank floor, suspended-ceiling tiles, and picture frames all have
  procedurally generated normal maps (derived from a heightfield via a
  Sobel-style gradient), so specular highlights pick up real surface detail
  instead of looking flat.
- **Bloom**: a bright-pass extracts over-threshold pixels into a second
  render target (via WebGL2 multiple render targets), which is downsampled
  and blurred (ping-ponged separable Gaussian) and added back additively —
  so the ceiling lights and painting spotlights actually glow.
- **HDR-ish pipeline**: the scene renders to an `RGBA16F` framebuffer (with
  a graceful fallback to `RGBA8` on GPUs lacking
  `EXT_color_buffer_float`), then gets exposure-adjusted, Reinhard
  tonemapped, gamma-corrected, and vignetted in a final composite pass.
- Procedural textures are generated as raw pixel buffers (no canvas
  round-trip), and all level geometry is authored directly in world space
  — same approach as the macroquad version — so there's no per-object
  model matrix, just a camera view-projection.

## Running locally

It's a static site with no build step:

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

## Project layout

- `index.html` — canvas, HUD, and on-screen touch controls (plain HTML/CSS
  this time, instead of being drawn into the 3D scene).
- `src/main.js` — WebGL setup, the render loop, input handling, and
  player movement/collision.
- `src/geometry.js` — builds the level's quads (rooms, doorways, floor,
  ceiling, picture frames) directly in world space.
- `src/textures.js` — procedural diffuse + normal map generation.
- `src/shaders.js` — all GLSL: the lit Blinn-Phong shader, emissive
  billboard shader for the glowing light fixtures, the separable blur
  pass, and the final composite/tonemap pass.
- `src/gl-utils.js` / `src/mat.js` — small WebGL and matrix/vector helpers.
- `assets/images/` — the same curated set of ray-traced renders used by
  the macroquad version.
