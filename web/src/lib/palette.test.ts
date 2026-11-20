import { describe, expect, it } from 'vitest';
import { orderTypes, typeColor } from './palette';
import { bundled } from './data';

describe('palette', () => {
  it('orders the types the same way every time, health first and bus stops last', () => {
    const types = Object.keys(bundled.facilities.counts);
    expect(orderTypes(types)).toEqual(['pharmacy', 'hospital', 'clinic', 'doctors', 'bus_stop']);
    expect(orderTypes([...types].reverse())).toEqual(orderTypes(types));
  });

  it('gives every bundled type its own colour', () => {
    const colours = Object.keys(bundled.facilities.counts).map(typeColor);
    expect(new Set(colours).size).toBe(colours.length);
  });
});
