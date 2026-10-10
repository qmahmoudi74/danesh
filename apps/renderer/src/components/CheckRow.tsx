import type { CheckResult } from '@danesh/contracts/smoke-report.ts';
import { Button, Disclosure, DisclosurePanel, Heading } from 'react-aria-components';
import {
  checkCopy,
  genericFail,
  genericPass,
  newerDatabaseBody,
  readOnlyDatabaseBody,
  timeoutFail,
} from '../lib/copy.ts';
import { Icon } from './Icons.tsx';
import { Ltr, TechnicalDetail } from './Layout.tsx';
import { type CheckStatus, StatusBadge } from './Status.tsx';
export type Row = { checkId: string; status: CheckStatus; result?: CheckResult };
export function CheckRow({ row }: { row: Row }) {
  const copy = Object.hasOwn(checkCopy, row.checkId) ? checkCopy[row.checkId] : undefined;
  const databaseFailure =
    row.checkId === 'database' && row.result?.fields?.libraryState === 'refused-newer'
      ? newerDatabaseBody
      : row.checkId === 'database' && row.result?.fields?.libraryState === 'read-only-recovery'
        ? readOnlyDatabaseBody
        : undefined;
  const sentence =
    row.status === 'pass'
      ? (copy?.pass ?? genericPass)
      : row.status === 'fail'
        ? row.result?.detail === 'timeout'
          ? timeoutFail
          : (databaseFailure ?? copy?.fail ?? genericFail)
        : row.status === 'not-run'
          ? 'این بررسی اجرا نشد. دوباره تلاش کنید.'
          : '';
  return (
    <Disclosure className="check-row" data-check-id={row.checkId} data-status={row.status}>
      <div className="check-top">
        <StatusBadge status={row.status} />
        <Heading level={2} className="check-name label">
          {copy?.name ?? <Ltr>{row.checkId}</Ltr>}
        </Heading>
        <Button className="button details-trigger" slot="trigger">
          جزئیات فنی
          <Icon name="chevron-down" />
        </Button>
      </div>
      {sentence && <p className="check-result">{sentence}</p>}
      <DisclosurePanel>
        {row.result && (
          <TechnicalDetail
            name={copy?.name ?? row.checkId}
            values={{
              checkId: row.checkId,
              status: row.status,
              durationMs: row.result.durationMs,
              detail: row.result.detail,
              ...(row.result.outputSha256 ? { outputSha256: row.result.outputSha256 } : {}),
            }}
            detail={row.result.fields}
          />
        )}
      </DisclosurePanel>
    </Disclosure>
  );
}
