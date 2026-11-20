// Facility types and their colours. The colours are CSS variables (--t-<type> in globals.css), so each
// theme can use its own shade and the charts follow the theme without a re-render.
const TYPE_ORDER = ['pharmacy', 'hospital', 'clinic', 'doctors', 'bus_stop'];

export function typeColor(type: string): string {
  return TYPE_ORDER.includes(type) ? `var(--t-${type.replace('_', '-')})` : 'var(--t-other)';
}

// Fixed order for legends and layers, so the same type gets the same slot everywhere.
export function orderTypes(types: string[]): string[] {
  const rank = (t: string) => {
    const i = TYPE_ORDER.indexOf(t);
    return i === -1 ? TYPE_ORDER.length : i;
  };
  return [...new Set(types)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
