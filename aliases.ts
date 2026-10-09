import { join } from 'node:path';

export function daneshAliases(repoRoot: string): Record<string, string> {
  return Object.fromEntries([
    ...['contracts', 'domain', 'storage', 'egress', 'engine-api', 'logging'].map(
      (name) => [`@danesh/${name}/`, `${join(repoRoot, 'packages', name, 'src')}/`],
    ),
    ['@danesh/engines/', `${join(repoRoot, 'packages', 'engines')}/`],
  ]);
}
