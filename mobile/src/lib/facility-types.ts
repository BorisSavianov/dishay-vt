// Fixed order for legends and layers: health first, bus stops last. Same order as web/src/lib/palette.ts.
const ORDER = ['pharmacy', 'hospital', 'clinic', 'doctors', 'bus_stop'];

export function orderTypes(types: string[]): string[] {
  const rank = (t: string) => {
    const i = ORDER.indexOf(t);
    return i === -1 ? ORDER.length : i;
  };
  return [...new Set(types)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
