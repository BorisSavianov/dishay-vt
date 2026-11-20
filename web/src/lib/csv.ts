import type { Datasets } from './types';

export const EXPORT_NAMES = ['population', 'physicians', 'facilities'] as const;
export type ExportName = (typeof EXPORT_NAMES)[number];

export function isExportName(value: string): value is ExportName {
  return (EXPORT_NAMES as readonly string[]).includes(value);
}

type Cell = string | number | undefined;

// One CSV field. Text that a spreadsheet would read as a formula gets a leading apostrophe.
function field(cell: Cell): string {
  if (cell === undefined) return '';
  if (typeof cell === 'number') return String(cell);
  const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(rows: Cell[][]): string {
  // A byte-order mark makes Excel read the Bulgarian names as UTF-8.
  return '\uFEFF' + rows.map((r) => r.map(field).join(',')).join('\r\n') + '\r\n';
}

// The dataset as CSV rows. Every row carries its source and licence, so a downloaded file is still attributed.
export function exportRows(datasets: Datasets, name: ExportName): Cell[][] {
  if (name === 'facilities') {
    const { points, meta } = datasets.facilities;
    return [
      ['type', 'name', 'lat', 'lon', 'source', 'license'],
      ...points.map((p) => [p.type, p.name, p.lat, p.lon, meta.source, meta.license]),
    ];
  }
  const { series, meta } = datasets[name];
  return [['year', 'value', 'source', 'license'], ...series.map((p) => [p.year, p.value, meta.source, meta.license])];
}
