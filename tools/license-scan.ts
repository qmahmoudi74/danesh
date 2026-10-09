import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import parse, { type Expression } from 'spdx-expression-parse';

export interface PackageLicense { name: string; version: string; license?: string; paths?: string[] }
export interface LicenseException {
  name: string; version: string; license: string; reason: string; reviewedOn: string;
  scope: 'build-only' | 'data' | 'verified-grant'; evidence: string[];
}
export interface LicensePolicy {
  allowed: string[]; reviewedExceptions: LicenseException[];
  nonCommercialPatterns: string[]; normalization: Record<string, string | null>;
  noticeObligations: Record<string, string>;
}
export interface BinaryEntry {
  component: string; shippedIn: string; license: string; source: string;
  reviewedOn: string; obligations: string[]; status: 'reviewed' | 'needs-review';
}
interface BinaryManifest { entries: BinaryEntry[]; excluded: { component: string; reason: string; status: 'excluded' }[] }
interface LockedPackage { id: string; name: string; version: string; integrity: string }
interface Metadata extends PackageLicense { integrity: string; source: string }
interface RetainedNotice { name: string; version: string; destination: string; sha256: string }
interface LicenseListEntry { name: string; versions: string[]; paths: string[]; license: string }
export interface ProductionNode { dependencies?: Record<string, ProductionNode>; optionalDependencies?: Record<string, ProductionNode> }
const copyleft = /^(?:A?GPL|LGPL)-/i;

function nonCommercial(license: string, policy: LicensePolicy): boolean {
  return policy.nonCommercialPatterns.some((pattern) => license.toLowerCase().includes(pattern.toLowerCase()));
}
function normalized(license: string, policy: LicensePolicy): string | undefined {
  const value = license.trim();
  if (Object.hasOwn(policy.normalization, value)) return policy.normalization[value] ?? undefined;
  return value || undefined;
}
function evaluate(expression: Expression, allowed: Set<string>): boolean {
  if ('license' in expression) return !copyleft.test(expression.license) && allowed.has(expression.license);
  const left = evaluate(expression.left, allowed), right = evaluate(expression.right, allowed);
  return expression.conjunction === 'or' ? left || right : left && right;
}
function canonical(expression: Expression): string {
  return 'license' in expression ? `${expression.license}${expression.plus ? '+' : ''}${expression.exception ? ` WITH ${expression.exception}` : ''}`
    : `(${canonical(expression.left)} ${expression.conjunction.toUpperCase()} ${canonical(expression.right)})`;
}
function equivalent(a: string, b: string): boolean {
  try { return canonical(parse(a)) === canonical(parse(b)); } catch { return a.trim() === b.trim(); }
}
export function licenseAllowed(pkg: PackageLicense, policy: LicensePolicy): boolean {
  const license = pkg.license ?? '';
  if (nonCommercial(license, policy)) return false;
  const value = normalized(license, policy);
  if (value) {
    try { if (evaluate(parse(value), new Set(policy.allowed))) return true; } catch { /* Unknown declarations require exact reviewed evidence. */ }
  }
  // Review cannot waive copyleft or a non-commercial declaration.
  if (/\b(?:A?GPL|LGPL)-/i.test(license)) return false;
  return policy.reviewedExceptions.some((entry) => entry.name === pkg.name && entry.version === pkg.version
    && equivalent(entry.license, license) && entry.reason.length > 0 && entry.evidence.length > 0);
}
export function checkCoverage(packages: PackageLicense[], lockedIds: string[]): string[] {
  const scanned = new Set(packages.map((pkg) => `${pkg.name}@${pkg.version}`));
  return lockedIds.filter((id) => !scanned.has(id)).map((id) => `Missing license metadata: ${id}`);
}
export function checkBuildOnlyDependencies(roots: ProductionNode[], policy: LicensePolicy): string[] {
  const names = new Set<string>();
  const visit = (node: ProductionNode): void => {
    for (const [name, child] of Object.entries({ ...node.dependencies, ...node.optionalDependencies })) { names.add(name); visit(child); }
  };
  roots.forEach(visit);
  return policy.reviewedExceptions.filter((entry) => entry.scope === 'build-only' && names.has(entry.name))
    .map((entry) => `Build-only exception in production graph: ${entry.name}`);
}
export function checkBinary(entry: BinaryEntry, policy: LicensePolicy): string | undefined {
  if (!entry.component || !entry.shippedIn || !entry.source || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedOn)
    || !Array.isArray(entry.obligations) || !['reviewed', 'needs-review'].includes(entry.status)) return 'Invalid binary manifest entry';
  if (nonCommercial(entry.license, policy) || /\bA?GPL-/i.test(entry.license)) return `Forbidden binary license: ${entry.component}`;
  // The approved plan records Electron's separate FFmpeg library as an unresolved release review, never an engine exception.
  if (entry.component === 'Electron FFmpeg' && entry.license === 'LGPL-2.1-or-later' && entry.status === 'needs-review') return undefined;
  if (!licenseAllowed({ name: entry.component, version: '', license: entry.license }, policy)) return `Unapproved binary license: ${entry.component}`;
  return undefined;
}
export function generateNotices(packages: PackageLicense[], notice: (pkg: PackageLicense) => string | undefined, ofl: string, retained: { label: string; text: string }[] = []): string {
  const sections = ['Danesh — original source MIT (see LICENSE).\nThird-party components retain their own licenses.\nThis inventory does not certify packaged binaries or unverified model grants.'];
  for (const pkg of [...packages].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'))) {
    if (!pkg.license?.includes('Apache-2.0')) continue;
    const text = notice(pkg); if (text !== undefined) sections.push(`${pkg.name}@${pkg.version} (Apache-2.0)\n${text}`);
  }
  sections.push(`@fontsource-variable/vazirmatn (OFL-1.1)\n${ofl}`);
  for (const entry of [...retained].sort((a, b) => a.label.localeCompare(b.label, 'en'))) sections.push(`${entry.label}\n${entry.text}`);
  return sections.join('\n\n----------------------------------------\n\n') + '\n';
}
export function noticesCurrent(expected: string, actual: string | undefined): boolean { return expected === actual; }

export function parseLockedPackages(text: string): LockedPackage[] {
  if (!text.includes("lockfileVersion: '9.0'")) throw new Error('Unsupported lockfile format');
  const records: LockedPackage[] = [];
  let inPackages = false, current: Omit<LockedPackage, 'integrity'> | undefined, declaredCount = 0;
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) { inPackages = line === 'packages:'; current = undefined; }
    if (!inPackages) continue;
    const entry = /^  ['"]?([^'"\s]+)['"]?:$/.exec(line);
    if (entry?.[1]) {
      declaredCount++;
      const id = entry[1]; const split = id.lastIndexOf('@');
      if (split <= 0) throw new Error(`Invalid package id: ${id}`);
      current = { id, name: id.slice(0, split), version: id.slice(split + 1) };
    }
    const integrity = /resolution: \{integrity: ([^},\s]+)/.exec(line)?.[1];
    if (current && integrity) { records.push({ ...current, integrity }); current = undefined; }
  }
  if (!records.length || records.length !== declaredCount || new Set(records.map((pkg) => pkg.id)).size !== records.length) throw new Error('Incomplete or duplicate lockfile package inventory');
  return records;
}

function collectInstalled(repoRoot: string): PackageLicense[] {
  const packages = new Map<string, PackageLicense>();
  for (const cwd of [repoRoot, join(repoRoot, 'apps/desktop')]) {
    const output = execFileSync('pnpm', ['licenses', 'list', '--json'], { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const list = JSON.parse(output) as Record<string, LicenseListEntry[]>;
    for (const entry of Object.values(list).flat()) {
      for (const path of entry.paths) {
        const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) as { name: string; version: string; license?: string };
        if (manifest.name !== entry.name || !entry.versions.includes(manifest.version)) throw new Error(`Unexpected installed package metadata: ${path}`);
        packages.set(`${manifest.name}@${manifest.version}`, { ...manifest, paths: [path] });
      }
    }
  }
  return [...packages.values()];
}

export function scan(repoRoot: string, writeNotices = false): { scanned: number; lockfile: number; failures: string[]; warnings: string[]; notices: 'ok' | 'stale' } {
  const policy = JSON.parse(readFileSync(join(repoRoot, 'tools/license-policy.json'), 'utf8')) as LicensePolicy;
  const locked = parseLockedPackages(readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf8'));
  const metadata = JSON.parse(readFileSync(join(repoRoot, 'third_party/package-license-metadata.json'), 'utf8')) as Metadata[];
  const installed = collectInstalled(repoRoot);
  const packages = new Map(installed.map((pkg) => [`${pkg.name}@${pkg.version}`, pkg]));
  const failures: string[] = [], warnings: string[] = [];
  for (const pkg of locked) {
    const record = metadata.find((row) => `${row.name}@${row.version}` === pkg.id);
    if (!record || record.integrity !== pkg.integrity || !record.source.startsWith('https://registry.npmjs.org/')) {
      failures.push(`Missing or mismatched integrity-bound review metadata: ${pkg.id}`); continue;
    }
    const existing = packages.get(pkg.id);
    if (existing && !equivalent(existing.license ?? '', record.license ?? '')) failures.push(`Installed license differs from reviewed declaration: ${pkg.id}`);
    if (!existing) packages.set(pkg.id, record);
  }
  for (const file of ['package.json', 'apps/desktop/package.json']) {
    const own = JSON.parse(readFileSync(join(repoRoot, file), 'utf8')) as { name: string; version?: string; license?: string };
    const pkg = { ...own, version: own.version ?? 'workspace' };
    packages.set(`${pkg.name}@${pkg.version}`, pkg);
  }
  const all = [...packages.values()];
  failures.push(...checkCoverage(all, locked.map((pkg) => pkg.id)));
  for (const pkg of all) if (!licenseAllowed(pkg, policy)) failures.push(`Unapproved package license: ${pkg.name}@${pkg.version}: ${pkg.license ?? 'MISSING'}`);
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'third_party/binary-licenses.json'), 'utf8')) as BinaryManifest;
  if (!Array.isArray(manifest.entries) || !Array.isArray(manifest.excluded)) throw new Error('Invalid binary manifest');
  for (const entry of manifest.entries) {
    const error = checkBinary(entry, policy); if (error) failures.push(error);
    if (entry.status === 'needs-review') warnings.push(`WARNING needs-review: ${entry.component}: ${entry.obligations.join('; ')}`);
  }
  for (const entry of manifest.excluded) if (entry.status !== 'excluded' || !entry.reason) failures.push('Invalid excluded binary record');
  const inventory = JSON.parse(readFileSync(join(repoRoot, 'third_party/PLAN-01-02-LICENSE-EVIDENCE.json'), 'utf8')) as { copies: RetainedNotice[]; canonicalLicenseTexts: { destination: string; sha256: string }[] };
  const retained = [...inventory.copies, ...inventory.canonicalLicenseTexts];
  const texts = retained.map((entry) => {
    const bytes = readFileSync(join(repoRoot, entry.destination));
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`Changed retained notice: ${entry.destination}`);
    return { label: entry.destination, text: bytes.toString('utf8') };
  });
  texts.push({ label: 'caniuse-lite (CC-BY-4.0 browser data; https://github.com/browserslist/caniuse-lite)', text: readFileSync(join(repoRoot, 'node_modules/caniuse-lite/LICENSE'), 'utf8') });
  for (const exception of policy.reviewedExceptions) for (const evidence of exception.evidence) if (!existsSync(join(repoRoot, evidence))) failures.push(`Missing exception evidence: ${evidence}`);
  const production = JSON.parse(execFileSync('pnpm', ['--dir', 'apps/desktop', 'list', '--prod', '--depth', 'Infinity', '--json'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })) as ProductionNode[];
  // Hoisted unsavedDependencies include tooling; only declared production edges establish reachability.
  failures.push(...checkBuildOnlyDependencies(production, policy));
  const generated = generateNotices(all, (pkg) => {
    for (const path of pkg.paths ?? []) for (const file of ['NOTICE', 'NOTICE.txt', 'NOTICE.md']) {
      const full = join(path, file); if (existsSync(full)) return readFileSync(full, 'utf8');
    }
    return undefined;
  }, readFileSync(join(repoRoot, 'node_modules/@fontsource-variable/vazirmatn/LICENSE'), 'utf8'), texts);
  const noticePath = join(repoRoot, 'third_party/THIRD-PARTY-NOTICES.txt');
  if (writeNotices && failures.length === 0) writeFileSync(noticePath, generated, 'utf8');
  const notices = noticesCurrent(generated, existsSync(noticePath) ? readFileSync(noticePath, 'utf8') : undefined) ? 'ok' : 'stale';
  return { scanned: packages.size, lockfile: locked.length, failures, warnings, notices };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = scan(process.cwd(), process.argv.includes('--write-notices'));
    for (const message of [...result.warnings, ...result.failures]) console.log(message);
    console.log(`license-scan: scanned=${result.scanned} lockfile=${result.lockfile} failures=${result.failures.length} notices=${result.notices}`);
    process.exitCode = result.failures.length || result.notices === 'stale' ? 1 : 0;
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
