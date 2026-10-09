import { join } from 'node:path';

export function daneshAliases(repoRoot: string): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const name of ['contracts', 'domain', 'storage', 'egress', 'engine-api', 'logging']) {
    aliases[`@danesh/${name}/`] = `${join(repoRoot, 'packages', name, 'src')}/`;
  }
  aliases['@danesh/engines/'] = `${join(repoRoot, 'packages', 'engines')}/`;
  return aliases;
}
