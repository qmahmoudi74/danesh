import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export function frontMatter(text: string): Record<string, string> {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
  if (block === undefined) throw new Error('Missing front matter');
  const fields: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const match = /^([\w-]+):\s*(.*)$/.exec(line);
    if (match?.[1] && match[2] !== undefined) {
      if (Object.hasOwn(fields, match[1]))
        throw new Error(`Duplicate front-matter key: ${match[1]}`);
      fields[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2').trim();
    }
  }
  return fields;
}
export function section(text: string, title: string): string | undefined {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(
    (line) => /^#{1,6} /.test(line) && line.replace(/^#{1,6} /, '').trim() === title,
  );
  if (start < 0) return undefined;
  const level = lines[start]?.match(/^#+/)?.[0].length ?? 0;
  const end = lines.findIndex(
    (line, index) =>
      index > start && /^#{1,6} /.test(line) && (line.match(/^#+/)?.[0].length ?? 0) <= level,
  );
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim();
}
export function repoFiles(root: string, directory: string): string[] {
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (
        ['node_modules', '.git', 'out', '.features-gen', 'dist', 'dist-test'].includes(entry.name)
      )
        continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path).replaceAll('\\', '/'));
    }
  };
  visit(join(root, directory));
  return files.sort();
}
