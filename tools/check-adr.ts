import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertFullHistory,
  fileAtCommit,
  isStrictAncestor,
  lastCommitTouching,
} from './lib/git.ts';
import { frontMatter, repoFiles, section } from './lib/markdown.ts';

function hasPlatform(text: string): boolean {
  return text.split(/\r?\n/).some((line) => {
    if (!line.trim().startsWith('|')) return false;
    const cells = line
      .trim()
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    return (
      cells.length >= 3 &&
      /[a-z]/i.test(cells[0] ?? '') &&
      /\d/.test(cells[1] ?? '') &&
      /\b(x64|arm64|amd64|x86_64|aarch64)\b/i.test(cells[2] ?? '') &&
      !cells.some((cell) => /^(?:n\/a|tbd|not run|<)/i.test(cell))
    );
  });
}
export function checkAdrs(root: string): string[] {
  assertFullHistory(root);
  const files = repoFiles(root, 'docs/adr').filter((file) => /\/\d{4}-[^/]+\.md$/.test(file));
  const errors: string[] = [];
  const required = [
    ...readFileSync(join(root, 'docs/adr/0000-template.md'), 'utf8').matchAll(/^## (.+)$/gm),
  ]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => value !== undefined);
  const seen = new Set<number>();
  const records = files.map((file) => {
    const number = Number(file.match(/\/(\d{4})-/)?.[1]);
    if (seen.has(number)) errors.push(`${file}: duplicate ADR number`);
    seen.add(number);
    const text = readFileSync(join(root, file), 'utf8');
    let fields: Record<string, string> = {};
    try {
      fields = frontMatter(text);
    } catch (error) {
      errors.push(`${file}: ${String(error)}`);
    }
    return { file, number, text, fields };
  });
  [...seen]
    .sort((a, b) => a - b)
    .forEach((number, index) => {
      if (number !== index) errors.push(`ADR sequence gap: expected ${index}, found ${number}`);
    });
  const license = records.find((record) => record.number === 4);
  for (const record of records) {
    const { file, text, fields, number } = record;
    for (const heading of required)
      if (section(text, heading) === undefined) errors.push(`${file}: missing section ${heading}`);
    if (
      !/^(proposed|accepted|rejected|deprecated|superseded by ADR-\d{4})$/.test(fields.status ?? '')
    )
      errors.push(`${file}: invalid status`);
    if (
      !['architecture', 'infrastructure', 'packaging', 'license', 'engine'].includes(
        fields.kind ?? '',
      )
    )
      errors.push(`${file}: invalid kind`);
    if (number !== 0 && !/^\d{4}-\d{2}-\d{2}$/.test(fields.date ?? ''))
      errors.push(`${file}: invalid date`);
    if (fields.status !== 'accepted') continue;
    if (fields.kind === 'engine') {
      if (license?.fields.status !== 'accepted' || license.fields.kind !== 'license')
        errors.push(`${file}: accepted engine requires accepted license ADR 0004`);
      else if (!fields.date || !license.fields.date || license.fields.date > fields.date)
        errors.push(`${file}: engine date precedes license date`);
    }
    if (!fields.spike) continue;
    if (!hasPlatform(section(text, 'Platforms actually run') ?? ''))
      errors.push(`${file}: missing actual platform OS/version/architecture row`);
    const sha = /Pass policy commit:\s*`?([a-f0-9]{7,40})\b/i.exec(text)?.[1];
    const resultCommit = lastCommitTouching(file, root);
    if (!sha || !resultCommit || !isStrictAncestor(sha, resultCommit, root))
      errors.push(`${file}: pass policy must be a strict ancestor of the result commit`);
    const current = section(text, 'Pass policy');
    if (!current) errors.push(`${file}: missing pass policy text`);
    if (sha && current) {
      try {
        const previous = section(fileAtCommit(sha, file, root), 'Pass policy');
        if (previous?.replace(/\s+/g, ' ').trim() !== current.replace(/\s+/g, ' ').trim())
          errors.push(`${file}: pass policy text differs from recorded commit`);
      } catch {
        errors.push(`${file}: cannot read recorded pass policy text`);
      }
    }
  }
  return errors;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const errors = checkAdrs(process.cwd());
    errors.forEach((error) => {
      console.error(`FAIL ${error}`);
    });
    console.log(`check-adr: failures=${errors.length}`);
    process.exitCode = errors.length ? 1 : 0;
  } catch (error) {
    console.error(`FAIL ${String(error)}`);
    process.exitCode = 1;
  }
}
