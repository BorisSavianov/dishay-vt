import type { Meta } from '@/lib/types';

export function Sources({
  metas,
  title,
  asOf,
  licence,
}: {
  metas: Meta[];
  title: string;
  asOf: string;
  licence: string;
}) {
  const unique = [...new Map(metas.map((m) => [m.source, m])).values()];
  return (
    <footer className="sources">
      <h2>{title}</h2>
      <ul>
        {unique.map((m) => (
          <li key={m.source}>
            {m.source}. {asOf}: {m.as_of}. {licence}: {m.license}.
          </li>
        ))}
      </ul>
    </footer>
  );
}
