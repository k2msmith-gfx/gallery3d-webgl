import { createProgram, uniformLocations, makeTargetTexture, makeFramebuffer, makeDepthRenderbuffer, makeFullscreenTriangle } from './gl-utils.js';
import * as M from './mat.js';
import { litVert, litFrag, emissiveVert, emissiveFrag, blurVert, blurFrag, compositeVert, compositeFrag } from './shaders.js';
import { generateWallMaps, generateFloorMaps, generateCeilingMaps, generateFrameMaps, flatNormalMap, uploadTexture, loadImageTexture } from './textures.js';
import * as Geo from './geometry.js';

// ---------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------

const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl2', { antialias: false });
if (!gl) {
  document.getElementById('loading').innerHTML = '<h1>WebGL2 unavailable</h1><p>Your browser does not support WebGL2.</p>';
  throw new Error('WebGL2 not supported');
}
gl.getExtension('EXT_color_buffer_float');

// ---------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------

const litProgram = createProgram(gl, litVert, litFrag);
const litUniforms = uniformLocations(gl, litProgram, [
  'uViewProj', 'uCameraPos', 'uAmbient', 'uTint', 'uShininess', 'uNormalStrength',
  'uLightCount', 'uDiffuseMap', 'uNormalMap',
]);
const litLightPosLoc = gl.getUniformLocation(litProgram, 'uLightPos[0]');
const litLightColorLoc = gl.getUniformLocation(litProgram, 'uLightColor[0]');
const litLightIntensityLoc = gl.getUniformLocation(litProgram, 'uLightIntensity[0]');

const emissiveProgram = createProgram(gl, emissiveVert, emissiveFrag);
const emissiveUniforms = uniformLocations(gl, emissiveProgram, [
  'uViewProj', 'uCenter', 'uCameraRight', 'uCameraUp', 'uSize', 'uColor', 'uIntensity',
]);

const blurProgram = createProgram(gl, blurVert, blurFrag);
const blurUniforms = uniformLocations(gl, blurProgram, ['uTex', 'uDirection']);

const compositeProgram = createProgram(gl, compositeVert, compositeFrag);
const compositeUniforms = uniformLocations(gl, compositeProgram, ['uScene', 'uBloom', 'uBloomStrength', 'uExposure']);

const fullscreenTri = makeFullscreenTriangle(gl);

// ---------------------------------------------------------------------
// Mesh buffer helpers
// ---------------------------------------------------------------------

function createMeshBuffers(gl, mesh) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const bind = (location, data, size) => {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  };
  bind(0, mesh.positions, 3);
  bind(1, mesh.normals, 3);
  bind(2, mesh.tangents, 3);
  bind(3, mesh.uvs, 2);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return { vao, indexCount: mesh.indices.length };
}

function mergeMeshes(meshes) {
  let vertexCount = 0;
  const positions = [], normals = [], tangents = [], uvs = [], indices = [];
  for (const m of meshes) {
    positions.push(...m.positions);
    normals.push(...m.normals);
    tangents.push(...m.tangents);
    uvs.push(...m.uvs);
    for (const idx of m.indices) indices.push(idx + vertexCount);
    vertexCount += m.positions.length / 3;
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

// ---------------------------------------------------------------------
// Build level geometry + materials
// ---------------------------------------------------------------------

const level = Geo.buildLevel();

const wallMaps = Geo.ROOM_COLORS.map((tint) => generateWallMaps(tint));
const floorMaps = generateFloorMaps();
const ceilingMaps = generateCeilingMaps();
const frameMaps = generateFrameMaps();
const flatNormal = flatNormalMap();

const wallDiffuseTex = wallMaps.map((m) => uploadTexture(gl, m.diffuse, m.size));
const wallNormalTex = wallMaps.map((m) => uploadTexture(gl, m.normal, m.size));
const floorDiffuseTex = uploadTexture(gl, floorMaps.diffuse, floorMaps.size);
const floorNormalTex = uploadTexture(gl, floorMaps.normal, floorMaps.size);
const ceilingDiffuseTex = uploadTexture(gl, ceilingMaps.diffuse, ceilingMaps.size);
const ceilingNormalTex = uploadTexture(gl, ceilingMaps.normal, ceilingMaps.size);
const frameDiffuseTex = uploadTexture(gl, frameMaps.diffuse, frameMaps.size);
const frameNormalTex = uploadTexture(gl, frameMaps.normal, frameMaps.size);
const flatNormalTex = uploadTexture(gl, flatNormal.pixels, flatNormal.size, { repeat: false });

const wallDraws = level.wallMeshes.map(({ room, mesh }) => ({
  ...createMeshBuffers(gl, mesh),
  diffuse: wallDiffuseTex[room],
  normal: wallNormalTex[room],
  shininess: 8.0,
  normalStrength: 1.0,
}));
const floorDraw = { ...createMeshBuffers(gl, level.floorMesh), diffuse: floorDiffuseTex, normal: floorNormalTex, shininess: 48.0, normalStrength: 1.0 };
const ceilingDraw = { ...createMeshBuffers(gl, level.ceilingMesh), diffuse: ceilingDiffuseTex, normal: ceilingNormalTex, shininess: 12.0, normalStrength: 0.6 };
const frameDraw = { ...createMeshBuffers(gl, mergeMeshes(level.frameMeshes)), diffuse: frameDiffuseTex, normal: frameNormalTex, shininess: 24.0, normalStrength: 1.0 };

const paintingSpecs = [
  ['assets/images/room1_apples.png', 'Shiny Apples'],
  ['assets/images/room1_fruitbowl.png', 'Fruit Bowl'],
  ['assets/images/room1_spheres.png', 'Two Spheres on a Table'],
  ['assets/images/room2_sponza.png', 'Sponza'],
  ['assets/images/room2_helmet.png', 'Damaged Helmet'],
  ['assets/images/room2_flighthelmet.png', 'Flight Helmet'],
  ['assets/images/room3_cornell.png', 'Cornell Box'],
  ['assets/images/room3_glass.png', 'Glass Marbles'],
  ['assets/images/room3_neon.png', 'Neon'],
];

const pictureBuffers = level.pictureMeshes.map(({ mesh }) => createMeshBuffers(gl, mesh));
let pictureDraws = [];

async function loadPaintings() {
  const textures = await Promise.all(paintingSpecs.map(([path]) => loadImageTexture(gl, path)));
  pictureDraws = pictureBuffers.map((buf, i) => ({
    ...buf,
    diffuse: textures[i],
    normal: flatNormalTex,
    shininess: 16.0,
    normalStrength: 0.0,
  }));
}

// ---------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------

const AMBIENT = [0.14, 0.14, 0.17];
const lights = [];
for (let room = 0; room < Geo.NUM_ROOMS; room++) {
  lights.push({ pos: Geo.ceilingLightPos(room), color: [1.0, 0.93, 0.78], intensity: 2.0 });
  for (const px of Geo.paintingSlotPositions(room)) {
    lights.push({ pos: Geo.spotlightPos(px), color: [1.0, 0.97, 0.88], intensity: 1.5 });
  }
}
const lightPosFlat = new Float32Array(lights.flatMap((l) => l.pos));
const lightColorFlat = new Float32Array(lights.flatMap((l) => l.color));
const lightIntensityFlat = new Float32Array(lights.map((l) => l.intensity));

const fixtures = [
  ...Array.from({ length: Geo.NUM_ROOMS }, (_, room) => ({
    pos: Geo.ceilingLightPos(room), color: [1.0, 0.95, 0.8], size: 0.34, intensity: 1.4,
  })),
  ...Geo.ROOM_COLORS.flatMap((_, room) => Geo.paintingSlotPositions(room).map((px) => ({
    pos: Geo.spotlightPos(px), color: [1.0, 0.98, 0.9], size: 0.14, intensity: 1.8,
  }))),
];

// ---------------------------------------------------------------------
// Bloom framebuffers (resized on canvas resize)
// ---------------------------------------------------------------------

let sceneFBO, sceneTex, brightTex, depthRB;
let blurFBO = [null, null];
let blurTex = [null, null];
let fboWidth = 0, fboHeight = 0, blurWidth = 0, blurHeight = 0;

// Prefer a floating-point scene buffer so bloom-bright values aren't
// clamped before tonemapping; fall back to RGBA8 on GPUs without
// EXT_color_buffer_float (common on some older mobile hardware).
let useFloatBuffers = true;

function buildFramebuffers(width, height, colorFormat) {
  const scTex = makeTargetTexture(gl, width, height, colorFormat);
  const brTex = makeTargetTexture(gl, width, height, colorFormat);
  const dRB = makeDepthRenderbuffer(gl, width, height);
  const fbo = makeFramebuffer(gl, [scTex, brTex], dRB);

  const bw = Math.max(1, Math.floor(width / 2));
  const bh = Math.max(1, Math.floor(height / 2));
  const bTex = [
    makeTargetTexture(gl, bw, bh, colorFormat),
    makeTargetTexture(gl, bw, bh, colorFormat),
  ];
  const bFBO = [
    makeFramebuffer(gl, [bTex[0]], null),
    makeFramebuffer(gl, [bTex[1]], null),
  ];
  return { fbo, scTex, brTex, dRB, bw, bh, bTex, bFBO };
}

function rebuildFramebuffers(width, height) {
  fboWidth = width; fboHeight = height;

  const floatFormat = { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };
  const byteFormat = { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };

  let built;
  try {
    if (!useFloatBuffers) throw new Error('float buffers disabled');
    built = buildFramebuffers(width, height, floatFormat);
  } catch (e) {
    console.warn('Falling back to RGBA8 scene buffers (no float render-target support):', e.message);
    useFloatBuffers = false;
    built = buildFramebuffers(width, height, byteFormat);
  }

  sceneFBO = built.fbo;
  sceneTex = built.scTex;
  brightTex = built.brTex;
  depthRB = built.dRB;
  blurWidth = built.bw;
  blurHeight = built.bh;
  blurTex = built.bTex;
  blurFBO = built.bFBO;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    rebuildFramebuffers(width, height);
  }
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------
// Input: keyboard + on-screen touch pads (Pointer Events unify mouse/touch)
// ---------------------------------------------------------------------

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

const touchState = { forward: false, back: false, left: false, right: false };
function wireButton(id, key) {
  const el = document.getElementById(id);
  const set = (v) => { touchState[key] = v; el.classList.toggle('active', v); };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); set(true); });
  el.addEventListener('pointerup', (e) => { e.preventDefault(); set(false); });
  el.addEventListener('pointercancel', () => set(false));
  el.addEventListener('lostpointercapture', () => set(false));
}
wireButton('btn-forward', 'forward');
wireButton('btn-back', 'back');
wireButton('btn-left', 'left');
wireButton('btn-right', 'right');

// ---------------------------------------------------------------------
// Player + collision (mirrors the original macroquad version's logic)
// ---------------------------------------------------------------------

const EYE_HEIGHT = 1.65;
const MOVE_SPEED = 4.2;
const TURN_SPEED = 1.9;
const PLAYER_MARGIN = 0.35;
const WALL_THICKNESS_COLLIDE = 0.22;

const player = {
  x: Geo.roomCenterX(0),
  z: Geo.ROOM_DEPTH / 2,
  yaw: Math.PI,
};

function blocked(x, z) {
  if (x < PLAYER_MARGIN || x > Geo.LEVEL_LENGTH - PLAYER_MARGIN) return true;
  if (z < PLAYER_MARGIN || z > Geo.ROOM_DEPTH - PLAYER_MARGIN) return true;
  for (let room = 0; room < Geo.NUM_ROOMS - 1; room++) {
    const wallX = Geo.ROOM_WIDTH * (room + 1);
    if (Math.abs(x - wallX) < WALL_THICKNESS_COLLIDE && !(z > Geo.DOOR_Z_MIN + 0.05 && z < Geo.DOOR_Z_MAX - 0.05)) {
      return true;
    }
  }
  return false;
}

function tryMove(dx, dz) {
  const fx = player.x + dx, fz = player.z + dz;
  if (!blocked(fx, fz)) { player.x = fx; player.z = fz; return; }
  if (!blocked(fx, player.z)) { player.x = fx; return; }
  if (!blocked(player.x, fz)) { player.z = fz; return; }
}

// ---------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------

function setLightUniforms() {
  gl.uniform1i(litUniforms.uLightCount, lights.length);
  gl.uniform3fv(litLightPosLoc, lightPosFlat);
  gl.uniform3fv(litLightColorLoc, lightColorFlat);
  gl.uniform1fv(litLightIntensityLoc, lightIntensityFlat);
  gl.uniform3fv(litUniforms.uAmbient, AMBIENT);
}

function drawMesh(draw, tint = [1, 1, 1]) {
  gl.bindVertexArray(draw.vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, draw.diffuse);
  gl.uniform1i(litUniforms.uDiffuseMap, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, draw.normal);
  gl.uniform1i(litUniforms.uNormalMap, 1);
  gl.uniform3fv(litUniforms.uTint, tint);
  gl.uniform1f(litUniforms.uShininess, draw.shininess);
  gl.uniform1f(litUniforms.uNormalStrength, draw.normalStrength);
  gl.drawElements(gl.TRIANGLES, draw.indexCount, gl.UNSIGNED_INT, 0);
}

function blurPass(srcTex, dstFBO, dstWidth, dstHeight, direction) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, dstFBO);
  gl.viewport(0, 0, dstWidth, dstHeight);
  gl.useProgram(blurProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.uniform1i(blurUniforms.uTex, 0);
  gl.uniform2fv(blurUniforms.uDirection, direction);
  gl.bindVertexArray(fullscreenTri);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ---------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------

let lastTime = performance.now();
let fpsAccum = 0, fpsFrames = 0, fpsDisplay = 0;
const fpsEl = document.getElementById('fps');

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  fpsAccum += dt; fpsFrames++;
  if (fpsAccum >= 0.5) {
    fpsDisplay = Math.round(fpsFrames / fpsAccum);
    fpsEl.textContent = `FPS: ${fpsDisplay}`;
    fpsAccum = 0; fpsFrames = 0;
  }

  const turnLeft = keys.has('ArrowLeft') || touchState.left;
  const turnRight = keys.has('ArrowRight') || touchState.right;
  const moveFwd = keys.has('ArrowUp') || touchState.forward;
  const moveBack = keys.has('ArrowDown') || touchState.back;

  if (turnLeft) player.yaw -= TURN_SPEED * dt;
  if (turnRight) player.yaw += TURN_SPEED * dt;
  const fx = Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  if (moveFwd) tryMove(fx * MOVE_SPEED * dt, fz * MOVE_SPEED * dt);
  if (moveBack) tryMove(-fx * MOVE_SPEED * dt, -fz * MOVE_SPEED * dt);

  const eye = [player.x, EYE_HEIGHT, player.z];
  const target = [player.x + fx, EYE_HEIGHT, player.z + fz];
  const view = M.lookAt(eye, target, [0, 1, 0]);
  const proj = M.perspective(1.15, canvas.width / canvas.height, 0.05, 100);
  const viewProj = M.multiply(proj, view);

  // --- Scene pass ---
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
  gl.viewport(0, 0, fboWidth, fboHeight);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.clearColor(0.02, 0.02, 0.035, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(litProgram);
  gl.uniformMatrix4fv(litUniforms.uViewProj, false, viewProj);
  gl.uniform3fv(litUniforms.uCameraPos, eye);
  setLightUniforms();

  for (const draw of wallDraws) drawMesh(draw);
  drawMesh(floorDraw);
  drawMesh(ceilingDraw);
  drawMesh(frameDraw);
  for (const draw of pictureDraws) drawMesh(draw);

  // --- Emissive light-fixture glows (additive) ---
  const viewRight = [view[0], view[4], view[8]];
  const viewUp = [view[1], view[5], view[9]];
  gl.useProgram(emissiveProgram);
  gl.uniformMatrix4fv(emissiveUniforms.uViewProj, false, viewProj);
  gl.uniform3fv(emissiveUniforms.uCameraRight, viewRight);
  gl.uniform3fv(emissiveUniforms.uCameraUp, viewUp);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.depthMask(false);
  gl.bindVertexArray(fixtureBillboard.vao);
  for (const fx2 of fixtures) {
    gl.uniform3fv(emissiveUniforms.uCenter, fx2.pos);
    gl.uniform1f(emissiveUniforms.uSize, fx2.size);
    gl.uniform3fv(emissiveUniforms.uColor, fx2.color);
    gl.uniform1f(emissiveUniforms.uIntensity, fx2.intensity);
    gl.drawElements(gl.TRIANGLES, fixtureBillboard.indexCount, gl.UNSIGNED_SHORT, 0);
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);

  // --- Bloom: downsample + ping-pong Gaussian blur ---
  const texelX = 1.2 / blurWidth, texelY = 1.2 / blurHeight;
  blurPass(brightTex, blurFBO[0], blurWidth, blurHeight, [texelX, 0]);
  blurPass(blurTex[0], blurFBO[1], blurWidth, blurHeight, [0, texelY]);
  blurPass(blurTex[1], blurFBO[0], blurWidth, blurHeight, [texelX, 0]);
  blurPass(blurTex[0], blurFBO[1], blurWidth, blurHeight, [0, texelY]);

  // --- Composite to canvas ---
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(compositeProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneTex);
  gl.uniform1i(compositeUniforms.uScene, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, blurTex[1]);
  gl.uniform1i(compositeUniforms.uBloom, 1);
  gl.uniform1f(compositeUniforms.uBloomStrength, 1.0);
  gl.uniform1f(compositeUniforms.uExposure, 0.62);
  gl.bindVertexArray(fullscreenTri);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  requestAnimationFrame(frame);
}

// A unit quad (-1..1) for the emissive billboards.
function makeBillboardQuad() {
  const positions = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, indexCount: indices.length };
}
const fixtureBillboard = makeBillboardQuad();

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------

loadPaintings().then(() => {
  document.getElementById('loading').classList.add('hidden');
  requestAnimationFrame((t) => { lastTime = t; requestAnimationFrame(frame); });
});
