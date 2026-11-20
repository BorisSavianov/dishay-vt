// Coordinates for the 3D story: the local Veliko Tarnovo terrain frame and a whole-Bulgaria frame.
// Scene axes: x grows east, z grows south (three.js looks down -z, so north is "away").

export type TerrainMeta = { west: number; east: number; south: number; north: number; minM: number; maxM: number; size: number };

// AWS Terrain Tiles "terrarium" encoding, metres.
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

// Lat/lon inside the terrain's bounds → a worldSize square centred on 0.
export function toScene(lat: number, lon: number, t: TerrainMeta, worldSize = 20): [number, number] {
  const u = (lon - t.west) / (t.east - t.west);
  const v = (t.north - lat) / (t.north - t.south);
  return [(u - 0.5) * worldSize, (v - 0.5) * worldSize];
}

// Bulgaria (22.3–28.7 E, 41.2–44.3 N), equirectangular with cos(42.75°), mapped to x ∈ [-20, 20].
const BG_LON0 = 25.5;
const BG_LAT0 = 42.75;
const BG_COS = Math.cos((BG_LAT0 * Math.PI) / 180);
const BG_K = 40 / ((28.7 - 22.3) * BG_COS);

export function toBg(lat: number, lon: number): [number, number] {
  return [(lon - BG_LON0) * BG_COS * BG_K, (BG_LAT0 - lat) * BG_K];
}
