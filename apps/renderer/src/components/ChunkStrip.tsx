import type { SampleJobSnapshot } from '@danesh/contracts/jobs.ts';
import { VisuallyHidden } from 'react-aria-components';
import { formatNumber } from '../lib/copy.ts';

export const chunkStateText = {
  queued: 'در انتظار',
  running: 'در حال انجام',
  done: 'انجام شد',
  failed: 'ناموفق',
  quarantined: 'ناموفق',
};
export function ChunkStrip({ chunks }: { chunks: SampleJobSnapshot['chunks'] }) {
  return (
    <ol className="chunk-strip" aria-label="بخش‌های کار نمونه">
      {chunks.map((chunk) => (
        <li
          key={chunk.index}
          className={`chunk-cell ${chunk.state}`}
          data-chunk={chunk.index}
          data-state={chunk.state}
        >
          <span aria-hidden="true">
            {chunk.state === 'done'
              ? '✓'
              : chunk.state === 'failed' || chunk.state === 'quarantined'
                ? '×'
                : ''}
          </span>
          <VisuallyHidden>
            بخش {formatNumber(chunk.index)}: {chunkStateText[chunk.state]}
          </VisuallyHidden>
        </li>
      ))}
    </ol>
  );
}
