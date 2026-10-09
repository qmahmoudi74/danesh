# Pinned third-party declaration compatibility

node-llama-cpp 3.22.1 has two published declaration defects under TypeScript 6.0.3 with declaration checking enabled:

- `getLlamaForOptions` destructures `tempDir`, but the annotated `LlamaOptions` type alias omits that property. The shipped JavaScript accepts the internal option and supplies `defaultTempDir`; this is an upstream declaration inconsistency, not a missing Danesh option.
- `readGgufFileInfo.d.ts` imports `async-retry` to reference `retry.Options`. The runtime dependency is installed, but its declarations are not shipped. Upstream lists `@types/async-retry` in devDependencies, which consumers do not receive.

The approved Plan 01-03 compiler configuration already uses `skipLibCheck: true`. Use that setting for compatibility with the reviewed dependency set, while preserving `strict`, `noUncheckedIndexedAccess` and normal checking of every Danesh `.ts`/`.tsx` source file and imported public type usage. No dependency version, installation, vendor patch, `any`, suppression comment or source-level exception is introduced.

The setting skips independent checking of declaration files, including Danesh's ambient declaration files; it does not fix the upstream declarations or validate every public declaration. Keep ambient declarations small and verify their use in strictly checked source and runtime contract tests. Do not use this setting to justify weak source types or accept invalid application calls.

Plan 01-02's compatibility probe passes with zero source diagnostics using the planned setting. A negative control assigning a numeric `gpu` to `LlamaOptions` still fails with TS2322. The original unsuppressed upstream diagnostics and root-cause evidence remain in the Phase 1 evidence directory. Reassess this compatibility setting when upgrading the pinned dependencies; upgrades require their own review.
