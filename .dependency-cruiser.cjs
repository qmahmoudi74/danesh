module.exports = {
  forbidden: [
    { name: 'network-only-in-egress', severity: 'error', from: { pathNot: '^packages/egress/' }, to: { path: '^(node:)?(http|https|net|tls|dns|dgram|http2|undici)$' } },
    { name: 'renderer-process-boundary', severity: 'error', from: { path: '^apps/renderer/' }, to: { path: '^packages/(storage|egress|engine-api|engines|logging|domain)/|^apps/(main|core|preload)/' } },
    { name: 'main-does-not-own-storage', severity: 'error', from: { path: '^apps/main/' }, to: { path: '^packages/storage/|(^|/)better-sqlite3(/|$)' } },
    { name: 'hosts-do-not-own-storage', severity: 'error', from: { path: '^packages/(engines|engine-api)/' }, to: { path: '^packages/storage/|(^|/)better-sqlite3(/|$)' } },
    { name: 'packages-do-not-import-electron', severity: 'error', from: { path: '^packages/(contracts|domain|storage|egress|logging)/' }, to: { path: '(^|/)electron(/|$)' } },
    { name: 'engines-only-in-hosts', severity: 'error', comment: 'Main and the renderer never load an engine: hosts are referenced by bundle file name only (Plan 01-09, D-24).', from: { path: '^apps/(main|renderer)/' }, to: { path: '^packages/engines/|(^|/)(node-llama-cpp|onnxruntime-node|tesseract.js)(/|$)' } },
    { name: 'domain-is-pure', severity: 'error', from: { path: '^packages/domain/' }, to: { path: '(^|/)better-sqlite3(/|$)|^(node:)?fs$' } },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    exclude: '(^|/)(out|dist[^/]*|\\.features-gen)/',
  },
};
