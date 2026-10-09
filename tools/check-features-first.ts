import { readFileSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoFiles } from './lib/markdown.ts';
import { assertFullHistory, firstAddCommit, isStrictAncestor } from './lib/git.ts';
const kinds = ['happy', 'invalid', 'edge', 'recovery', 'cancellation', 'persistence'];

export function checkFeatures(root: string, allowUnbound = false): { errors: string[]; info: string[] } {
  assertFullHistory(root);
  const errors: string[] = [], info: string[] = [];
  const sources = ['apps', 'packages'].flatMap((dir) => existsSync(join(root, dir)) ? repoFiles(root, dir) : []);
  for (const file of repoFiles(root, 'features').filter((path) => path.endsWith('.feature'))) {
    const text = readFileSync(join(root, file), 'utf8');
    if ([...text.matchAll(/^\s*Feature:\s*\S.+$/gm)].length !== 1) errors.push(`${file}: must describe exactly one capability`);
    const tags = [...text.matchAll(/^\s*(@[^\r\n]+)$/gm)].map((match) => match[1] ?? '').join(' ');
    if (!/@req-[\w-]+/.test(tags)) errors.push(`${file}: missing requirement tag`);
    const scenarios = [...text.matchAll(/^\s*Scenario(?: Outline)?:\s*(.+)$/gm)].map((match) => match[1]?.trim() ?? '');
    if (!scenarios.length) errors.push(`${file}: no scenario`);
    if (new Set(scenarios).size !== scenarios.length) errors.push(`${file}: duplicate scenario name`);
    for (const kind of kinds) {
      const explanation = new RegExp(`^\\s*# n/a kind-${kind}:\\s*\\S.+$`, 'm');
      if (!tags.split(/\s+/).includes(`@kind-${kind}`) && !explanation.test(text)) errors.push(`${file}: missing kind-${kind} or justified n/a`);
    }
    const name = basename(file, '.feature');
    const steps = file.startsWith('features/ui/') ? [`features/steps/${name}.steps.ts`].filter((path) => existsSync(join(root, path)))
      : sources.filter((path) => path.includes('/test/') && path.endsWith(`/${name}.feature.test.ts`));
    if (!steps.length && !allowUnbound) errors.push(`${file}: no step file yet`);
    const covered = [...text.matchAll(/^\s*# covers:\s*(.+)$/gm)].flatMap((match) => (match[1] ?? '').split(',').map((path) => path.trim()).filter(Boolean));
    if (!covered.length) errors.push(`${file}: missing covers declaration`);
    const featureCommit = firstAddCommit(file, root);
    if (!featureCommit) errors.push(`${file}: feature not committed`);
    for (const path of [...steps, ...covered]) {
      if (!existsSync(join(root, path))) { info.push(`${file}: not yet implemented ${path}`); continue; }
      const sourceCommit = firstAddCommit(path, root);
      if (!featureCommit || !sourceCommit || !isStrictAncestor(featureCommit, sourceCommit, root)) errors.push(`${file}: feature must be committed strictly before ${path}`);
    }
  }
  return { errors, info };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const result = checkFeatures(process.cwd(), process.argv.includes('--allow-unbound')); result.info.forEach((line) => console.log(`INFO ${line}`)); result.errors.forEach((line) => console.error(`FAIL ${line}`)); console.log(`check-features-first: failures=${result.errors.length}`); process.exitCode = result.errors.length ? 1 : 0; }
  catch (error) { console.error(`FAIL ${String(error)}`); process.exitCode = 1; }
}
