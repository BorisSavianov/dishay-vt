export type Lang = 'bg' | 'en';

export type DatasetName = 'population' | 'physicians' | 'facilities';

export type Meta = {
  source: string;
  as_of: string;
  license: string;
  generated_at: string;
};

export type Series = {
  meta: Meta;
  series: { year: number; value: number }[];
};

// What the OpenStreetMap volunteers entered. Everything except the position and type is optional.
export type Point = {
  lat: number;
  lon: number;
  type: string;
  name?: string;
  address?: string;
  hours?: string;
  phone?: string;
  website?: string;
};

export type Points = {
  meta: Meta;
  counts: Record<string, number>;
  points: Point[];
};

export type Datasets = {
  population: Series;
  physicians: Series;
  facilities: Points;
};

// GeoJSON geometry, longitude first. Rings are closed: the last position repeats the first.
export type RegionGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

// The province boundary. `check` says how many of the facilities the pipeline found inside it.
export type Region = {
  meta: Meta;
  geometry: RegionGeometry;
  check: { points: number; inside: number };
};
