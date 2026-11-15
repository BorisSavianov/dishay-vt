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

export type Point = { lat: number; lon: number; type: string; name?: string };

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
