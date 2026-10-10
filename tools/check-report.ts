import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface ReportRow {
  id: string;
  status: string;
  evidence: string[];
  notShown: string;
}
export function reportRows(text: string): ReportRow[] {
  const lines = text.split(/\r?\n/);
  const header = lines.findIndex((line) =>
    /^\|\s*Req\s*\|\s*Status\s*\|\s*Evidence(?: paths)?\s*\|\s*What was NOT shown\s*\|\s*$/.test(
      line,
    ),
  );
  if (header < 0) throw new Error('Missing required report table columns');
  const rows: ReportRow[] = [];
  for (const line of lines.slice(header + 1)) {
    if (!line.trim().startsWith('|')) break;
    const cells = line
      .trim()
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    if (
      cells.length !== 4 ||
      !cells[0] ||
      !cells[1] ||
      cells[2] === undefined ||
      cells[3] === undefined
    )
      throw new Error('Malformed report table row');
    rows.push({
      id: cells[0].replaceAll('`', ''),
      status: cells[1],
      evidence: cells[2]
        .split(';')
        .map((path) => path.replaceAll('`', '').trim())
        .filter(Boolean),
      notShown: cells[3],
    });
  }
  return rows;
}
function contained(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(root, path));
  return (
    !isAbsolute(path) &&
    !isAbsolute(rel) &&
    rel !== '..' &&
    !rel.startsWith('../') &&
    !rel.startsWith('..\\')
  );
}
function unsuccessfulEvidence(file: string): boolean {
  if (/\.(?:png|jpe?g|webp|pdf)$/i.test(file)) return false;
  const text = readFileSync(file, 'utf8');
  if (
    [...text.matchAll(/\b(?:EXIT|exitCode|exit code)\s*[:=]\s*(-?\d+)/gi)].some(
      (match) => Number(match[1]) !== 0,
    )
  )
    return true;
  if (/\b[1-9]\d* failed\b|\bfailures=[1-9]\d*\b/.test(text)) return true;
  if (file.endsWith('.json')) {
    try {
      const data = JSON.parse(text) as { overall?: string; exitCode?: number };
      return data.overall === 'fail' || (data.exitCode !== undefined && data.exitCode !== 0);
    } catch {
      return true;
    }
  }
  return false;
}
export function validateReport(root: string, text: string, ids: string[]): string[] {
  const errors: string[] = [];
  let rows: ReportRow[];
  try {
    rows = reportRows(text);
  } catch (error) {
    return [String(error)];
  }
  if (/%|pass rate/i.test(text)) errors.push('Uncomputed aggregate figure in report');
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) errors.push(`duplicate requirement ${row.id}`);
    seen.add(row.id);
    if (!ids.includes(row.id)) errors.push(`unexpected requirement ${row.id}`);
    if (!['verified', 'partially verified', 'blocked'].includes(row.status))
      errors.push(`${row.id}: invalid status`);
    if (row.status !== 'verified' && !row.notShown)
      errors.push(`${row.id}: missing what was not shown`);
    if (row.status === 'verified' && !row.evidence.length)
      errors.push(`${row.id}: verified without evidence`);
    for (const path of row.evidence) {
      if (!contained(root, path)) {
        errors.push(`${row.id}: evidence outside repository: ${path}`);
        continue;
      }
      const file = resolve(root, path);
      if (!existsSync(file) || !statSync(file).isFile()) {
        errors.push(`${row.id}: missing evidence file ${path}`);
        continue;
      }
      if (!contained(realpathSync(root), relative(realpathSync(root), realpathSync(file)))) {
        errors.push(`${row.id}: evidence symlink outside repository`);
        continue;
      }
      if (row.status === 'verified' && unsuccessfulEvidence(file))
        errors.push(`${row.id}: unsuccessful recorded verification: ${path}`);
    }
    if (row.status === 'verified' && ['REL-01', 'REL-02'].includes(row.id)) {
      if (
        row.evidence.every(
          (path) =>
            path.startsWith('.github/') || /(?:^|\/)test(?:s)?\/|\.test\.[cm]?[jt]sx?$/.test(path),
        )
      )
        errors.push(`${row.id}: CI config or unit-test source alone cannot verify an installer`);
      if (
        row.id === 'REL-02' &&
        !row.evidence.some((path) =>
          /^\.planning\/phases\/[^/]+\/evidence\/tier-b-[^/]+\//.test(path),
        )
      )
        errors.push('REL-02: missing Tier B evidence');
    }
  }
  for (const id of ids) if (!seen.has(id)) errors.push(`Missing requirement ${id}`);
  if (rows.map((row) => row.id).join(',') !== ids.join(','))
    errors.push('Requirements are not in source order');
  const verified = rows.filter((row) => row.status === 'verified').length;
  const partial = rows.filter((row) => row.status === 'partially verified').length;
  const blocked = rows.filter((row) => row.status === 'blocked').length;
  const counts = [
    ...text.matchAll(/^Counts: verified (\d+), partially verified (\d+), blocked (\d+)\s*$/gm),
  ];
  if (
    counts.length !== 1 ||
    Number(counts[0]?.[1]) !== verified ||
    Number(counts[0]?.[2]) !== partial ||
    Number(counts[0]?.[3]) !== blocked
  )
    errors.push('Counts do not match report rows');
  return errors;
}

export function checkReport(root: string, phase: string): { errors: string[]; rows: ReportRow[] } {
  if (!/^\d{1,2}$/.test(phase)) throw new Error('Phase must be a numeric id');
  const padded = phase.padStart(2, '0');
  const directory = readdirSync(join(root, '.planning/phases')).find((name) =>
    name.startsWith(padded + '-'),
  );
  const file = directory
    ? join(root, '.planning/phases', directory, `${padded}-VERIFICATION.md`)
    : undefined;
  if (!file || !existsSync(file))
    return { errors: [`report not found: phase ${padded}`], rows: [] };
  const roadmap = readFileSync(join(root, '.planning/ROADMAP.md'), 'utf8');
  const phaseHeader = new RegExp(`^### Phase ${Number(phase)}:.*$`, 'm').exec(roadmap);
  if (!phaseHeader) throw new Error('Phase not found in roadmap');
  const phaseText = roadmap.slice(phaseHeader.index).split(/\n### Phase /)[0] ?? '';
  const phaseIds = /\*\*Requirements\*\*:\s*([^\r\n]+)/.exec(phaseText)?.[1]?.match(/[A-Z]+-\d+/g);
  if (!phaseIds?.length) throw new Error('Phase requirements not found');
  const requirements = readFileSync(join(root, '.planning/REQUIREMENTS.md'), 'utf8');
  const order = [...requirements.matchAll(/^- \[[ x]\] \*\*([A-Z]+-\d+)\*\*:/gm)]
    .map((match) => match[1] ?? '')
    .filter((id) => phaseIds.includes(id));
  if (order.length !== phaseIds.length)
    throw new Error('Roadmap requirement missing from canonical requirements');
  const text = readFileSync(file, 'utf8');
  const errors = validateReport(root, text, order);
  return { errors, rows: errors.length ? [] : reportRows(text) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const phaseIndex = process.argv.indexOf('--phase');
    const phase = process.argv[phaseIndex + 1];
    if (phaseIndex < 0 || !phase) throw new Error('Usage: node tools/check-report.ts --phase <NN>');
    const result = checkReport(process.cwd(), phase);
    result.errors.forEach((error) => console.error(`FAIL ${error}`));
    if (result.errors.length) process.exitCode = 1;
    else
      console.log(
        `check-report: rows=${result.rows.length} verified=${result.rows.filter((row) => row.status === 'verified').length} partial=${result.rows.filter((row) => row.status === 'partially verified').length} blocked=${result.rows.filter((row) => row.status === 'blocked').length}`,
      );
  } catch (error) {
    console.error(`FAIL ${String(error)}`);
    process.exitCode = 1;
  }
}
