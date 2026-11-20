import { describe, expect, it } from 'vitest';
import { bundled } from './data';
import { exportRows, isExportName, toCsv } from './csv';

describe('csv', () => {
  it('quotes fields with commas, quotes and line breaks', () => {
    expect(toCsv([['a,b', 'say "hi"', 'x\ny']])).toBe('\uFEFF"a,b","say ""hi""","x\ny"\r\n');
  });

  it('neutralises text that a spreadsheet would run as a formula, but not numbers', () => {
    expect(toCsv([['=SUM(A1)', '+1', '-1', '@x', -5, 3.5]])).toBe("\uFEFF'=SUM(A1),'+1,'-1,'@x,-5,3.5\r\n");
  });

  it('leaves missing values empty', () => {
    expect(toCsv([['a', undefined, 'b']])).toBe('\uFEFFa,,b\r\n');
  });

  it('exports every dataset with a header, its rows, the source and the licence', () => {
    const pop = exportRows(bundled, 'population');
    expect(pop[0]).toEqual(['year', 'value', 'source', 'license']);
    expect(pop).toHaveLength(1 + bundled.population.series.length);
    expect(pop[1]![0]).toBe(2015);
    expect(exportRows(bundled, 'physicians')).toHaveLength(1 + bundled.physicians.series.length);
    const fac = exportRows(bundled, 'facilities');
    expect(fac).toHaveLength(1 + bundled.facilities.points.length);
    expect(fac[0]).toEqual(['type', 'name', 'lat', 'lon', 'source', 'license']);
  });

  it('knows the dataset names', () => {
    expect(isExportName('population')).toBe(true);
    expect(isExportName('../etc/passwd')).toBe(false);
  });
});
