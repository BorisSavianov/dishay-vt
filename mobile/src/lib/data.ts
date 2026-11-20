import type { Datasets, Region } from '../shared/types';
import facilities from '../shared/data/facilities_veliko_tarnovo.json';
import physicians from '../shared/data/health_physicians_bg.json';
import region from '../shared/data/region_veliko_tarnovo.json';
import population from '../shared/data/population_veliko_tarnovo.json';

// Bundled with the app, so the figures work offline. Only the AI summary needs the network.
export const bundled = { population, physicians, facilities } as unknown as Datasets;

// The province outline, from OpenStreetMap. Bundled only: it never changes with the data refresh.
export const bundledRegion = region as unknown as Region;
