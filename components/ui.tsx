// Small shared UI primitives so the same purpose looks the same on every screen.
import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return <header className="page-header">
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {description && <p className="page-lede">{description}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>;
}

export function SectionHeader({ title, meta, id }: { title: string; meta?: ReactNode; id?: string }) {
  return <div className="section-head"><h2 id={id}>{title}</h2>{meta && <span className="section-meta">{meta}</span>}</div>;
}

export type TagState = 'done' | 'active' | 'idle' | 'danger' | 'warn';
const glyph: Record<TagState, string> = { done: '✓', active: '●', idle: '○', danger: '!', warn: '△' };
/** Status is always conveyed by text + glyph, never by color alone. */
export function StatusTag({ state, children }: { state: TagState; children: ReactNode }) {
  return <span className={`tag tag-${state}`}><span aria-hidden="true">{glyph[state]}</span>{children}</span>;
}

export function Meter({ value, max, label, showValue = true }: { value: number; max: number; label: string; showValue?: boolean }) {
  const pct = max ? Math.round(value / max * 100) : 0;
  return <span className="meter-wrap">
    <span className="meter" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></span>
    {showValue && <span className="meter-value mono">{pct}%</span>}
  </span>;
}
