// Builds the gallery level as a set of draw groups (one VAO each), mirroring
// the room layout of the original macroquad version but with real per-pixel
// lighting, so geometry stays a single quad per surface (no subdivision
// needed just to fake smooth lighting).

export const ROOM_WIDTH = 8;
export const ROOM_DEPTH = 10;
export const ROOM_HEIGHT = 4;
export const NUM_ROOMS = 3;
export const LEVEL_LENGTH = ROOM_WIDTH * NUM_ROOMS;
export const DOOR_Z_MIN = ROOM_DEPTH / 2 - 1.3;
export const DOOR_Z_MAX = ROOM_DEPTH / 2 + 1.3;
const DIVIDER_EPS = 0.01;

// Boost saturation a bit so each room still reads as clearly colored once
// it's lit (real per-pixel lighting blends in a lot of the warm-white
// light color, which flattens pale tints more than the old baked-lighting
// version did).
function saturate(color, factor) {
  const lum = 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2];
  return color.map((c) => lum + (c - lum) * factor);
}

export const ROOM_COLORS = [
  saturate([0.80, 0.60, 0.54], 1.5), // warm terracotta
  saturate([0.56, 0.67, 0.78], 1.5), // cool slate blue
  saturate([0.60, 0.74, 0.58], 1.5), // sage green
];

export function roomColor(room) {
  return ROOM_COLORS[room % ROOM_COLORS.length];
}

export function roomCenterX(room) {
  return ROOM_WIDTH * room + ROOM_WIDTH / 2;
}

class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.tangents = [];
    this.uvs = [];
    this.indices = [];
  }

  // origin + uAxis/vAxis (full-size edge vectors, not unit) define the
  // quad; uvRepeat controls how many times the texture tiles across it.
  addQuad(origin, uAxis, vAxis, normal, uvRepeatU, uvRepeatV) {
    const base = this.positions.length / 3;
    const corners = [
      [origin, [0, 0]],
      [addv(origin, uAxis), [uvRepeatU, 0]],
      [addv(addv(origin, uAxis), vAxis), [uvRepeatU, uvRepeatV]],
      [addv(origin, vAxis), [0, uvRepeatV]],
    ];
    const tangent = normalize(uAxis);
    for (const [pos, uv] of corners) {
      this.positions.push(pos[0], pos[1], pos[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.tangents.push(tangent[0], tangent[1], tangent[2]);
      this.uvs.push(uv[0], uv[1]);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  toArrays() {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      tangents: new Float32Array(this.tangents),
      uvs: new Float32Array(this.uvs),
      indices: new Uint32Array(this.indices),
    };
  }
}

function addv(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function normalize(a) {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

/// One mesh per room's walls (south/north/end-caps/dividers), so each room
/// can use its own tinted wall material.
function buildRoomWalls(room) {
  const b = new MeshBuilder();
  const x0 = ROOM_WIDTH * room;
  const x1 = ROOM_WIDTH * (room + 1);
  const tileWorldSize = 2.0;

  // South wall (z=0).
  b.addQuad([x0, 0, 0], [x1 - x0, 0, 0], [0, ROOM_HEIGHT, 0], [0, 0, 1],
    (x1 - x0) / tileWorldSize, ROOM_HEIGHT / tileWorldSize);
  // North wall (z=ROOM_DEPTH) — paintings hang here.
  b.addQuad([x1, 0, ROOM_DEPTH], [x0 - x1, 0, 0], [0, ROOM_HEIGHT, 0], [0, 0, -1],
    (x1 - x0) / tileWorldSize, ROOM_HEIGHT / tileWorldSize);

  if (room === 0) {
    b.addQuad([0, 0, ROOM_DEPTH], [0, 0, -ROOM_DEPTH], [0, ROOM_HEIGHT, 0], [1, 0, 0],
      ROOM_DEPTH / tileWorldSize, ROOM_HEIGHT / tileWorldSize);
  }
  if (room === NUM_ROOMS - 1) {
    b.addQuad([LEVEL_LENGTH, 0, 0], [0, 0, ROOM_DEPTH], [0, ROOM_HEIGHT, 0], [-1, 0, 0],
      ROOM_DEPTH / tileWorldSize, ROOM_HEIGHT / tileWorldSize);
  }

  if (room < NUM_ROOMS - 1) {
    const x = x1 - DIVIDER_EPS;
    b.addQuad([x, 0, 0], [0, 0, DOOR_Z_MIN], [0, ROOM_HEIGHT, 0], [-1, 0, 0],
      DOOR_Z_MIN / tileWorldSize, ROOM_HEIGHT / tileWorldSize);
    b.addQuad([x, 0, DOOR_Z_MAX], [0, 0, ROOM_DEPTH - DOOR_Z_MAX], [0, ROOM_HEIGHT, 0], [-1, 0, 0],
      (ROOM_DEPTH - DOOR_Z_MAX) / tileWorldSize, ROOM_HEIGHT / tileWorldSize);
    b.addQuad([x, ROOM_HEIGHT * 0.75, DOOR_Z_MIN], [0, 0, DOOR_Z_MAX - DOOR_Z_MIN], [0, ROOM_HEIGHT * 0.25, 0], [-1, 0, 0],
      (DOOR_Z_MAX - DOOR_Z_MIN) / tileWorldSize, (ROOM_HEIGHT * 0.25) / tileWorldSize);
  }
  if (room > 0) {
    const x = x0 + DIVIDER_EPS;
    b.addQuad([x, 0, DOOR_Z_MIN], [0, 0, -DOOR_Z_MIN], [0, ROOM_HEIGHT, 0], [1, 0, 0],
      DOOR_Z_MIN / tileWorldSize, ROOM_HEIGHT / tileWorldSize);
    b.addQuad([x, 0, ROOM_DEPTH], [0, 0, DOOR_Z_MAX - ROOM_DEPTH], [0, ROOM_HEIGHT, 0], [1, 0, 0],
      (ROOM_DEPTH - DOOR_Z_MAX) / tileWorldSize, ROOM_HEIGHT / tileWorldSize);
    b.addQuad([x, ROOM_HEIGHT * 0.75, DOOR_Z_MAX], [0, 0, DOOR_Z_MIN - DOOR_Z_MAX], [0, ROOM_HEIGHT * 0.25, 0], [1, 0, 0],
      (DOOR_Z_MAX - DOOR_Z_MIN) / tileWorldSize, (ROOM_HEIGHT * 0.25) / tileWorldSize);
  }

  return b.toArrays();
}

function buildFloor() {
  const b = new MeshBuilder();
  const tileWorldSize = 2.0;
  b.addQuad([0, 0, 0], [LEVEL_LENGTH, 0, 0], [0, 0, ROOM_DEPTH], [0, 1, 0],
    LEVEL_LENGTH / tileWorldSize, ROOM_DEPTH / tileWorldSize);
  return b.toArrays();
}

function buildCeiling() {
  const b = new MeshBuilder();
  const tileWorldSize = 2.0;
  b.addQuad([0, ROOM_HEIGHT, ROOM_DEPTH], [LEVEL_LENGTH, 0, 0], [0, 0, -ROOM_DEPTH], [0, -1, 0],
    LEVEL_LENGTH / tileWorldSize, ROOM_DEPTH / tileWorldSize);
  return b.toArrays();
}

export const PICTURE_W = 1.8;
export const PICTURE_H = 1.3;
export const PICTURE_Y = 1.9;
export const FRAME_BORDER = 0.12;
export const WALL_Z = ROOM_DEPTH - 0.01;

export function paintingSlotPositions(room) {
  const cx = roomCenterX(room);
  const spacing = ROOM_WIDTH / 3;
  return [cx - spacing, cx, cx + spacing];
}

function buildFrame(px) {
  const b = new MeshBuilder();
  b.addQuad(
    [px - PICTURE_W / 2 - FRAME_BORDER, PICTURE_Y - PICTURE_H / 2 - FRAME_BORDER, WALL_Z],
    [PICTURE_W + FRAME_BORDER * 2, 0, 0],
    [0, PICTURE_H + FRAME_BORDER * 2, 0],
    [0, 0, -1],
    1, 1,
  );
  return b.toArrays();
}

function buildPicture(px) {
  const b = new MeshBuilder();
  b.addQuad(
    [px - PICTURE_W / 2, PICTURE_Y - PICTURE_H / 2, WALL_Z - 0.005],
    [PICTURE_W, 0, 0],
    [0, PICTURE_H, 0],
    [0, 0, -1],
    1, 1,
  );
  return b.toArrays();
}

/// Returns { wallMeshes: [{room, mesh}], floorMesh, ceilingMesh,
/// frameMeshes: [mesh...], pictureMeshes: [{room, slot, mesh}] }
export function buildLevel() {
  const wallMeshes = [];
  for (let room = 0; room < NUM_ROOMS; room++) {
    wallMeshes.push({ room, mesh: buildRoomWalls(room) });
  }

  const frameMeshes = [];
  const pictureMeshes = [];
  for (let room = 0; room < NUM_ROOMS; room++) {
    const xs = paintingSlotPositions(room);
    xs.forEach((px, slot) => {
      frameMeshes.push(buildFrame(px));
      pictureMeshes.push({ room, slot, mesh: buildPicture(px) });
    });
  }

  return {
    wallMeshes,
    floorMesh: buildFloor(),
    ceilingMesh: buildCeiling(),
    frameMeshes,
    pictureMeshes,
  };
}

/// Ceiling light position for a room (used for both the actual light and
/// its glowing fixture billboard).
export function ceilingLightPos(room) {
  return [roomCenterX(room), ROOM_HEIGHT - 0.12, ROOM_DEPTH / 2];
}

/// Spotlight position above a painting slot.
export function spotlightPos(px) {
  return [px, ROOM_HEIGHT - 0.3, ROOM_DEPTH - 1.1];
}
