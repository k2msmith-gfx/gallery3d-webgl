// Procedurally generated diffuse + tangent-space normal maps, built as raw
// RGBA8 pixel buffers (no canvas round-trip) so there's no premultiplied-
// alpha or color-space surprises. Mirrors the look of the original
// macroquad version's procedural textures, but now backed by real normal
// maps for per-pixel lighting.

function hash(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function makeRGBA(size) {
  return new Uint8Array(size * size * 4);
}

function setPixel(buf, size, x, y, r, g, b, a = 255) {
  const i = (y * size + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}

/// Converts a heightfield (Float32Array, values roughly in [-1, 1]) into a
/// tangent-space normal map via a Sobel-style gradient estimate.
function heightsToNormalMap(heights, size, strength) {
  const out = makeRGBA(size);
  const at = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // Tangent-space normal: perturb +Z by the height gradient.
      let nx = -dx, ny = -dy, nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len; ny /= len; nz /= len;
      setPixel(out, size, x, y,
        Math.round((nx * 0.5 + 0.5) * 255),
        Math.round((ny * 0.5 + 0.5) * 255),
        Math.round((nz * 0.5 + 0.5) * 255));
    }
  }
  return out;
}

export function flatNormalMap() {
  const buf = makeRGBA(2);
  for (let i = 0; i < 4; i++) {
    buf[i * 4] = 128; buf[i * 4 + 1] = 128; buf[i * 4 + 2] = 255; buf[i * 4 + 3] = 255;
  }
  return { pixels: buf, size: 2 };
}

/// Lightly textured plaster: subtle noise bump, tinted to the room color.
export function generateWallMaps(tint, size = 256) {
  const diffuse = makeRGBA(size);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = hash(x * 0.9, y * 0.9) * 0.6 + hash(x * 0.07, y * 0.07) * 0.4;
      heights[y * size + x] = n - 0.5;
      const shade = 0.94 + n * 0.1;
      setPixel(diffuse, size, x, y,
        Math.round(tint[0] * 255 * shade),
        Math.round(tint[1] * 255 * shade),
        Math.round(tint[2] * 255 * shade));
    }
  }
  const normal = heightsToNormalMap(heights, size, 1.1);
  return { diffuse, normal, size };
}

/// Wood plank floor: recessed seams between planks, grain noise, a normal
/// map strong enough to pick up nice specular streaks under the lights.
export function generateFloorMaps(size = 256) {
  const diffuse = makeRGBA(size);
  const heights = new Float32Array(size * size);
  const plankRows = 8;
  const plankH = Math.max(1, Math.floor(size / plankRows));
  const seamSpan = Math.max(2, Math.floor(size / 3));

  for (let y = 0; y < size; y++) {
    const plankIdx = Math.floor(y / plankH);
    const offset = (plankIdx % 2 === 0) ? 0 : Math.floor(seamSpan / 2);
    for (let x = 0; x < size; x++) {
      const seamX = (x + offset) % seamSpan < 2;
      const seamY = (y % plankH) < 2;
      const seam = seamX || seamY;
      const grain = hash(x * 0.15 + plankIdx * 7.0, plankIdx * 3.1) * 0.5
        + hash(x * 1.3, y * 1.3) * 0.2;
      heights[y * size + x] = seam ? -1.0 : (grain - 0.35);

      if (seam) {
        setPixel(diffuse, size, x, y, 46, 28, 16);
      } else {
        const shade = 0.82 + grain * 0.3;
        const toneShift = (plankIdx % 3) * 0.04;
        setPixel(diffuse, size, x, y,
          Math.round(255 * (0.40 + toneShift) * shade),
          Math.round(255 * (0.25 + toneShift * 0.6) * shade),
          Math.round(255 * (0.15 + toneShift * 0.4) * shade));
      }
    }
  }
  const normal = heightsToNormalMap(heights, size, 2.2);
  return { diffuse, normal, size };
}

/// Suspended ceiling tiles: a shallow grid of grout lines.
export function generateCeilingMaps(size = 128) {
  const diffuse = makeRGBA(size);
  const heights = new Float32Array(size * size);
  const tile = Math.max(1, Math.floor(size / 4));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grid = (x % tile) < 1 || (y % tile) < 1;
      const n = hash(x * 0.5, y * 0.5);
      heights[y * size + x] = grid ? -1.0 : (n * 0.15);
      const base = grid ? 0.82 : 0.95 + n * 0.03;
      setPixel(diffuse, size, x, y,
        Math.round(255 * base * 0.97),
        Math.round(255 * base * 0.97),
        Math.round(255 * base));
    }
  }
  const normal = heightsToNormalMap(heights, size, 1.5);
  return { diffuse, normal, size };
}

/// Dark wood picture-frame material with a beveled inner edge.
export function generateFrameMaps(size = 64) {
  const diffuse = makeRGBA(size);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = hash(x * 0.3, y * 2.0) * 0.08;
      const edgeDist = Math.min(x, y, size - 1 - x, size - 1 - y) / size;
      const bevel = Math.min(edgeDist * 6.0, 1.0);
      heights[y * size + x] = (bevel - 0.5) * 0.6;
      const shade = 0.5 + bevel * 0.5 + n;
      setPixel(diffuse, size, x, y,
        Math.round(255 * 0.16 * shade),
        Math.round(255 * 0.11 * shade),
        Math.round(255 * 0.08 * shade));
    }
  }
  const normal = heightsToNormalMap(heights, size, 1.8);
  return { diffuse, normal, size };
}

export function uploadTexture(gl, pixels, size, { srgb = false, repeat = true } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const internalFormat = srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8;
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.generateMipmap(gl.TEXTURE_2D);
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const ext = gl.getExtension('EXT_texture_filter_anisotropic');
  if (ext) {
    const max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
  }
  return tex;
}

export function loadImageTexture(gl, url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      resolve(tex);
    };
    img.onerror = reject;
    img.src = url;
  });
}
