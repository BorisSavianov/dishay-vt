import { NextResponse } from 'next/server';
import { exportRows, isExportName, toCsv } from '@/lib/csv';
import { loadDatasets } from '@/lib/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// CSV download of one dataset: /api/export/population, /physicians or /facilities.
export async function GET(_req: Request, ctx: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await ctx.params;
  if (!isExportName(dataset)) {
    return NextResponse.json({ error: 'unknown_dataset' }, { status: 404 });
  }
  const { datasets } = await loadDatasets();
  return new NextResponse(toCsv(exportRows(datasets, dataset)), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="veliko-tarnovo-${dataset}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
