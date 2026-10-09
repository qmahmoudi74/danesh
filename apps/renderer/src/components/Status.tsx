import { Heading } from 'react-aria-components';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icons.tsx';
export type CheckStatus = 'pending' | 'running' | 'pass' | 'fail' | 'not-run' | 'warn';
const statuses: Record<CheckStatus, { label: string; icon: IconName }> = {
  pending: { label: 'در انتظار', icon: 'circle-dashed' }, running: { label: 'در حال اجرا', icon: 'loader-arc' },
  pass: { label: 'موفق', icon: 'check-circle' }, fail: { label: 'ناموفق', icon: 'x-circle' },
  'not-run': { label: 'اجرا نشد', icon: 'circle-dashed' }, warn: { label: 'هشدار', icon: 'alert-triangle' },
};
export function StatusBadge({ status }: { status: CheckStatus }) { const value = statuses[status]; return <span className={`status-badge ${status}`}><Icon name={value.icon} />{value.label}</span>; }
export function Banner({ variant, title, body, actions, alert = false, running = false }: { variant: 'info' | 'warn' | 'error' | 'success'; title?: string; body?: ReactNode; actions?: ReactNode; alert?: boolean; running?: boolean }) {
  return <div className={`banner ${variant}`} role={alert ? 'alert' : undefined}><Icon name={running ? 'loader-arc' : variant === 'success' ? 'check-circle' : variant === 'error' ? 'x-circle' : variant === 'warn' ? 'alert-triangle' : 'info'} /><div className="banner-content">{title && <Heading level={2} className="heading">{title}</Heading>}{body && <p>{body}</p>}{actions}</div></div>;
}
