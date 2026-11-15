export function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <article className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      <p className="stat-sub">{sub}</p>
    </article>
  );
}
