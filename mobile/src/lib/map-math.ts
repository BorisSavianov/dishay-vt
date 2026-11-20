// Map arithmetic for the native map. Pure, so node:test can run it.
// Web mercator: the whole world is 256 * 2^zoom pixels wide, the same scale the web map uses.
import type { Bounds } from '../shared/geo';

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
export type Bbox = [west: number, south: number, east: number, north: number];

const TILE = 256;
const RAD = Math.PI / 180;

// The zoom level a region shows when the map is `widthPx` wide.
export function zoomOf(region: Region, widthPx: number): number {
  return Math.log2((360 * widthPx) / (TILE * Math.max(region.longitudeDelta, 1e-9)));
}

export function bboxOf(region: Region): Bbox {
  return [
    region.longitude - region.longitudeDelta / 2,
    region.latitude - region.latitudeDelta / 2,
    region.longitude + region.longitudeDelta / 2,
    region.latitude + region.latitudeDelta / 2,
  ];
}

// The region centred on a point at a given zoom: the inverse of zoomOf.
export function regionAt(center: { latitude: number; longitude: number }, zoom: number, widthPx: number, heightPx: number): Region {
  const longitudeDelta = (360 * widthPx) / (TILE * 2 ** zoom);
  // A degree of longitude is shorter than a degree of latitude by cos(latitude).
  const latitudeDelta = longitudeDelta * (heightPx / widthPx) * Math.cos(center.latitude * RAD);
  return { ...center, latitudeDelta, longitudeDelta };
}

// A region that shows the whole box with a margin. The map widens it to its own aspect ratio.
export function regionFitting(bounds: Bounds, margin = 1.12): Region {
  const latitude = (bounds.minLat + bounds.maxLat) / 2;
  const longitude = (bounds.minLon + bounds.maxLon) / 2;
  return {
    latitude,
    longitude,
    latitudeDelta: Math.max((bounds.maxLat - bounds.minLat) * margin, 0.002),
    longitudeDelta: Math.max((bounds.maxLon - bounds.minLon) * margin, 0.002),
  };
}
