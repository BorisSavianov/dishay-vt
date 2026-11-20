import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bboxOf, regionAt, regionFitting, zoomOf } from './map-math';

test('zoomOf: a 360 degree span in 256 px is zoom 0, and each halving adds one', () => {
  assert.equal(zoomOf({ latitude: 0, longitude: 0, latitudeDelta: 1, longitudeDelta: 360 }, 256), 0);
  assert.equal(zoomOf({ latitude: 0, longitude: 0, latitudeDelta: 1, longitudeDelta: 180 }, 256), 1);
  assert.equal(zoomOf({ latitude: 0, longitude: 0, latitudeDelta: 1, longitudeDelta: 45 }, 512), 4);
});

test('regionAt is the inverse of zoomOf', () => {
  const r = regionAt({ latitude: 43.08, longitude: 25.63 }, 11, 390, 320);
  assert.ok(Math.abs(zoomOf(r, 390) - 11) < 1e-9);
  assert.equal(r.latitude, 43.08);
  assert.equal(r.longitude, 25.63);
});

test('regionAt: a degree of latitude is longer than a degree of longitude away from the equator', () => {
  const r = regionAt({ latitude: 60, longitude: 0 }, 5, 400, 400);
  assert.ok(Math.abs(r.latitudeDelta - r.longitudeDelta * 0.5) < 1e-9);
});

test('bboxOf is west, south, east, north around the centre', () => {
  const box = bboxOf({ latitude: 43, longitude: 25, latitudeDelta: 0.4, longitudeDelta: 0.6 });
  assert.deepEqual(box.map((n) => Math.round(n * 100) / 100), [24.7, 42.8, 25.3, 43.2]);
});

test('regionFitting centres the box and adds a margin', () => {
  const r = regionFitting({ minLat: 43, maxLat: 44, minLon: 25, maxLon: 27 }, 1.5);
  assert.equal(r.latitude, 43.5);
  assert.equal(r.longitude, 26);
  assert.equal(r.latitudeDelta, 1.5);
  assert.equal(r.longitudeDelta, 3);
});

test('regionFitting never collapses to a point', () => {
  const r = regionFitting({ minLat: 43, maxLat: 43, minLon: 25, maxLon: 25 });
  assert.ok(r.latitudeDelta > 0 && r.longitudeDelta > 0);
});
