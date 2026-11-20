'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export type ExportItem = { href: string; label: string };

// A disclosure menu of CSV downloads. Closes on Escape, on a click outside, and after choosing a file.
export function ExportMenu({ label, items }: { label: string; items: ExportItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="download" />
        {label}
        <Icon name="chevron" />
      </button>
      {open && (
        <ul className="menu-list">
          {items.map((item) => (
            <li key={item.href}>
              <a href={item.href} download onClick={() => setOpen(false)}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
