// Veliko Tarnovo centre in scene coordinates (terrain frame), shared by the town lights and the smog.
import terrain from '../../../public/story/terrain.json';
import { toScene } from '@/lib/story/geo';

export const TOWN: [number, number] = toScene(43.0757, 25.6172, terrain);
