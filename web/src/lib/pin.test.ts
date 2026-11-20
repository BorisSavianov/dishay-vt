import { describe, expect, it } from 'vitest';
import { typeLabel } from './facts';
import { pinDetails, regionCaveat, safeWebsite } from './pin';

describe('safeWebsite', () => {
  it('keeps http and https links and adds https to a bare domain', () => {
    expect(safeWebsite('https://example.com/a')).toBe('https://example.com/a');
    expect(safeWebsite('http://example.com')).toBe('http://example.com/');
    expect(safeWebsite('example.com')).toBe('https://example.com/');
  });

  it('rejects other schemes and junk', () => {
    expect(safeWebsite('javascript:alert(1)')).toBeNull();
    expect(safeWebsite('data:text/html,<b>x</b>')).toBeNull();
    expect(safeWebsite('')).toBeNull();
    expect(safeWebsite(undefined)).toBeNull();
  });
});

describe('pinDetails', () => {
  it('titles an unnamed pin by its type', () => {
    const d = pinDetails('en', { lat: 1, lon: 2, type: 'bus_stop' });
    expect(d.title).toBe(typeLabel('en', 'bus_stop'));
    expect(d.title).not.toBe('');
    expect(d.rows).toEqual([]);
    expect(d.website).toBeNull();
  });

  it('lists the details that exist and no others', () => {
    const d = pinDetails('en', {
      lat: 1,
      lon: 2,
      type: 'pharmacy',
      name: 'Sopharmacy',
      address: 'Main St 1, Veliko Tarnovo',
      hours: 'Mo-Fr 08:00-20:00',
      website: 'javascript:alert(1)',
    });
    expect(d.title).toBe('Sopharmacy');
    expect(d.rows.map((r) => r.label)).toEqual(['Type', 'Address', 'Opening hours']);
    expect(d.website).toBeNull();
  });
});

describe('regionCaveat', () => {
  it('claims every point is inside only when the check found that', () => {
    expect(regionCaveat('en', { points: 303, inside: 303 })).toContain('All 303 points');
    expect(regionCaveat('en', { points: 303, inside: 300 })).toContain('300 of 303');
  });
});
