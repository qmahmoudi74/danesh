import { Button, Disclosure, DisclosurePanel, Heading } from 'react-aria-components';
import type { CheckResult } from '@danesh/contracts/smoke-report.ts';
import { StatusBadge, type CheckStatus } from './Status.tsx';
import { TechnicalDetail, Ltr } from './Layout.tsx';
import { Icon } from './Icons.tsx';
import { checkCopy, genericPass, genericFail, timeoutFail } from '../lib/copy.ts';
export type Row = { checkId: string; status: CheckStatus; result?: CheckResult };
export function CheckRow({ row }: { row: Row }) {
  const copy = Object.hasOwn(checkCopy, row.checkId) ? checkCopy[row.checkId] : undefined;
  const sentence = row.status === 'pass' ? copy?.pass ?? genericPass : row.status === 'fail' ? (row.result?.detail === 'timeout' ? timeoutFail : copy?.fail ?? genericFail) : row.status === 'not-run' ? 'این بررسی اجرا نشد. دوباره تلاش کنید.' : '';
  return <Disclosure className="check-row" data-check-id={row.checkId} data-status={row.status}><div className="check-top"><StatusBadge status={row.status} /><Heading level={2} className="check-name label">{copy?.name ?? <Ltr>{row.checkId}</Ltr>}</Heading><Button className="button details-trigger" slot="trigger">جزئیات فنی<Icon name="chevron-down" /></Button></div>{sentence && <p className="check-result">{sentence}</p>}<DisclosurePanel>{row.result && <TechnicalDetail name={copy?.name ?? row.checkId} values={{ checkId: row.checkId, status: row.status, durationMs: row.result.durationMs, detail: row.result.detail, ...(row.result.outputSha256 ? { outputSha256: row.result.outputSha256 } : {}) }} detail={row.result.fields} />}</DisclosurePanel></Disclosure>;
}
