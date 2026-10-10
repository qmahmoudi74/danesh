import type { ReactNode } from 'react';
export function Ltr({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}
export function AppShell({
  children,
  footer,
  home = false,
  wide = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  home?: boolean;
  /** For the page viewer, which needs the whole content width. */
  wide?: boolean;
}) {
  return (
    <main className={`app-shell ${home ? 'home' : ''} ${wide ? 'wide' : ''}`}>
      {children}
      {footer && <footer className="footer caption">{footer}</footer>}
    </main>
  );
}
export function TechnicalDetail({
  name,
  values,
  detail,
}: {
  name: string;
  values?: Record<string, string | number | boolean>;
  detail?: Record<string, string | number | boolean>;
}) {
  return (
    <section
      className="technical"
      dir="ltr"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a focusable scroll region lets keyboard users scroll overflowing details (UI-SPEC)
      tabIndex={0}
      aria-label={`جزئیات فنی ${name}`}
    >
      {values && (
        <dl dir="ltr">
          {Object.entries(values).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>
                <Ltr>{String(value)}</Ltr>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {detail && <pre dir="ltr">{JSON.stringify(detail, null, 2)}</pre>}
    </section>
  );
}
