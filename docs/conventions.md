# Coding conventions and architecture

Short on purpose. If a rule is not here, copy the style of the nearest well-formed file. Enforced by Biome, ESLint,
dependency-cruiser (`pnpm depcruise`) and the tests; rules that no tool enforces are marked (review).

## Layout and dependency direction

```
apps/main       Electron Main: windows, menus, protocol, process supervision. No SQL, no engines.
apps/preload    The only bridge: exposes call/on, validates, nothing else.
apps/renderer   React UI. Imports only packages/contracts. Never Node, never Electron.
apps/core       Core utilityProcess: RPC server, System checks, jobs. The only process that opens the database.
packages/contracts   zod schemas and types shared by every process. No logic that needs Electron or Node I/O.
packages/storage     All SQL and migrations. Other code calls its functions.
packages/engine-api  Host runtime used by every engine host.
packages/engines/*   One folder per engine (LLM, OCR, TTS). Loaded only inside their own host process.
packages/logging     Payload-free JSON-lines logger.
tools/               Build, CI and verification scripts (Node, no app imports except contracts).
features/            Gherkin scenarios and their Playwright steps.
```

Direction: `renderer → contracts`; `preload → contracts`; `main → contracts, logging`; `core → contracts, storage,
logging, engine-api`; `engines → contracts, engine-api`. Nothing imports `apps/*` from `packages/*`.

Organize **by feature inside an app** when a screen or capability grows (for example `apps/renderer/src/screens/Foo/`
with its component, hook and test together). Do not add layers such as `services/`, `utils/`, `helpers/` or
`managers/`; name the file after what it does.

## New file, abstraction, package, folder

- New **file** when a module has two responsibilities or exceeds roughly 200 lines. Otherwise extend the existing one.
- New **abstraction** (class, interface, wrapper) only when two real callers need it today. Prefer a function.
- New **package** or top-level folder only when a process boundary or a dependency rule requires it. Record why.
- New **dependency**: exact pin, license checked against `tools/license-policy.json`, entry in
  `third_party/package-license-metadata.json`, and the user told. Prefer the platform and existing libraries.

## Naming and files

- Files: `kebab-case.ts`; React components `PascalCase.tsx`; one exported component per file (small helpers may share).
- Functions are verbs, booleans read as questions (`isAllowedNavigation`), types and components are nouns.
- Relative imports include the extension (`./x.ts`). Prefer named exports; default exports only where a tool requires.
- Tests live next to the module they test in new code (`foo.ts` + `foo.test.ts`); existing `test/` folders stay as is.
  Gherkin scenarios in `features/`, their step files in `features/steps/`.

## TypeScript

- `strict` plus `noUncheckedIndexedAccess`. No `any`; `unknown` plus a zod parse at every trust boundary.
- Validate data from outside the process once, at the edge, and pass typed values inward.
- Errors: throw `Error` subclasses with a stable `name`/`code` for expected failures; catch only where you can act.
  Never swallow silently: log metadata (never payloads) or rethrow. Messages shown to users are Persian copy, not
  error text.

## React

- Function components, hooks only. State lives in the lowest component that needs it; share via props before context.
- Every `useEffect` that subscribes, listens or sets a timer returns its cleanup. `window.danesh.on` returns an
  unsubscribe: always call it.
- Derive values during render instead of syncing state in effects. Memoize only after measuring.
- Interactive elements use React Aria Components. Icons are decorative (`aria-hidden`) with an accessible name on the
  control. Status is never color alone.

## Styling and accessibility

- Square design language: `--radius` is 0. No shadows or gradients; hierarchy comes from type, spacing, 1px borders
  and surface contrast.
- All colors, spacing steps, durations and sizes are tokens in `apps/renderer/src/styles/tokens.css`. No color
  literals elsewhere (a test enforces it). Light and dark are designed independently; contrast is tested.
- Logical CSS properties only (`inline-size`, `margin-inline-start`); a test bans physical `left/right`.
- Motion uses the duration/easing tokens and collapses under `prefers-reduced-motion`.
- Every control is keyboard operable with a visible focus ring; targets are at least 24 px (44 px in content).

## IPC and security

- A new capability = a contract in `packages/contracts` (strict schema, byte limit) + handler + test. Never widen the
  preload surface. Every receiver validates; invalid input is rejected and logged without its content.
- Renderer-supplied paths are never trusted: use Main-issued single-use tokens.
- Test-only hooks exist only behind `__TEST_HOOKS__` and must not appear in production output (a scanner checks).

## Settings

- One Settings screen, one list of sections (`apps/renderer/src/screens/Settings.tsx`). Show only settings that work today;
  add a section in the same commit as its feature. Never expose implementation details; prefer detection and defaults.
- A setting is saved only after the user changes it (defaults follow the system), validated by a schema in
  `packages/contracts`, changed through a typed IPC method, and persisted by Main in one store.
- No application menu or hamburger on Windows/Linux. macOS keeps its system menu.

## Async, processes and memory

- Long operations take an `AbortSignal` (or expose `cancel`) and always release what they started (ports, timers,
  child processes, models). Engines load on demand and stop when idle.
- Cache and queue sizes have an explicit upper bound. Stream large files; never hold a whole PDF/model in memory
  when a stream will do.
- Never block Main or the renderer with synchronous I/O beyond start-up.

## Database

- One writer: Core, through `packages/storage`. All SQL lives there (`pnpm depcruise` enforces it).
- Migrations are forward-only, hand-written, checksummed, numbered SQL files with a verified backup before applying.
- Raw SQL is fine for migrations, PRAGMAs, FTS5 and vector search; use a typed query layer for ordinary tables (see
  `docs/engineering/technology-review.md`).

## Testing

- Behavior first: a Gherkin scenario for user-visible behavior (committed before the code), Vitest for pure logic and
  contracts, Playwright against the Electron test build for flows. Real files and processes beat mocks.
- Each bug fix adds a test that fails without it. Tests assert behavior, not implementation details.
- Report what ran. "Verified" means executed on that OS in this session.
