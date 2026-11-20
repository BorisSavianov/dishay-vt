import type { ReactNode } from 'react';
import { Icon, type IconName } from './shell/Icon';

export function Kpi({
  icon,
  label,
  value,
  primary = false,
  children,
}: {
  icon: IconName;
  label: string;
  value: string;
  primary?: boolean;
  children?: ReactNode;
}) {
  return (
    <article className={`kpi${primary ? ' is-primary' : ''}`}>
      <p className="kpi-top">
        <Icon name={icon} />
        {label}
      </p>
      <p className="kpi-value">{value}</p>
      <p className="kpi-sub">{children}</p>
    </article>
  );
}
