import type { ReactNode } from 'react';
export function Ltr({ children }: { children: ReactNode }) { return <bdi dir="ltr">{children}</bdi>; }
export function AppShell({ children, footer, home = false }: { children: ReactNode; footer?: ReactNode; home?: boolean }) { return <main className={`app-shell ${home ? 'home' : ''}`}>{children}{footer && <footer className="footer caption">{footer}</footer>}</main>; }
export function TechnicalDetail({ name, values, detail }: { name: string; values?: Record<string, string | number | boolean>; detail?: Record<string, string | number | boolean> }) {
  return <div className="technical" dir="ltr" tabIndex={0} role="region" aria-label={`جزئیات فنی ${name}`}>{values && <dl dir="ltr">{Object.entries(values).map(([key, value]) => <div key={key}><dt>{key}</dt><dd><Ltr>{String(value)}</Ltr></dd></div>)}</dl>}{detail && <pre dir="ltr">{JSON.stringify(detail, null, 2)}</pre>}</div>;
}
