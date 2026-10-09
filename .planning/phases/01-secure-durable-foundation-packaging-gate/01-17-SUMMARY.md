---
phase: 01-secure-durable-foundation-packaging-gate
plan: "17"
subsystem: desktop-ui
status: complete
completed: 2026-10-10
requires: [01-06]
origin: user-directed amendment 2026-10-10 (premium desktop shell, themes, design system)
provides:
  - Frameless window with custom title bar and Windows/Linux window controls; native traffic lights on macOS
  - System/Light/Dark themes persisted by Main and applied before first paint
  - Semantic design tokens for both themes, motion tokens, themed scrollbars
  - Collapsible sidebar of real destinations and a theme-only Settings screen
  - Layout-independent navigation and zoom shortcuts for the frameless window
requirements-completed: []
key-files:
  created:
    - packages/contracts/src/preferences.ts
    - packages/contracts/test/preferences.test.ts
    - apps/main/src/preferences.ts
    - apps/main/src/window-chrome.ts
    - apps/main/src/policy/shell-dispatch.ts
    - apps/main/src/policy/window-options.ts
    - apps/main/src/policy/shortcuts.ts
    - apps/main/test/preferences.test.ts
    - apps/main/test/shell-dispatch.test.ts
    - apps/renderer/src/styles/tokens.css
    - apps/renderer/src/lib/theme.ts
    - apps/renderer/src/components/Chrome.tsx
    - apps/renderer/src/components/Sidebar.tsx
    - apps/renderer/src/screens/Settings.tsx
    - apps/renderer/test/design-tokens.test.ts
    - features/ui/desktop-shell.feature
    - features/steps/desktop-shell.steps.ts
  modified:
    - .planning/phases/01-secure-durable-foundation-packaging-gate/01-UI-SPEC.md (Amendment A)
    - packages/contracts/src/shell.ts
    - apps/main/src/index.ts
    - apps/main/src/shell-ipc.ts
    - apps/main/src/menu.ts
    - apps/renderer/src/app.css
    - apps/renderer/src/router.tsx
    - apps/renderer/src/main.tsx
    - apps/renderer/src/components/Icons.tsx
    - features/ui/app-shell.feature
    - features/steps/app-shell.steps.ts
    - features/steps/fixtures.ts
    - features/steps/system-check.steps.ts
---

# Plan 01-17 completed

The user's 2026-10-10 product-design requirements are implemented on feat/danesh-phase-01 as a narrowly scoped
follow-up to the completed 01-06 UI. The 01-06 record is unchanged. No dependencies, lockfile changes, installs,
downloads or remote actions occurred.

## Commits (features-first order)

| Commit | Content |
| --- | --- |
| a36753d | Plan, UI-SPEC Amendment A (design contract), desktop-shell.feature, Home scenario scoped to page content |
| 3ca83b6 | Main/contracts: frameless window, validated window/theme IPC, preferences, bounds restore |
| 57ee5bc | Renderer: tokens, title bar, sidebar, settings, scrolling, motion |
| 033f0d9 | Shortcut scenario added before its fix |
| 56e7f78 | Layout-independent shortcuts for the frameless window; menu/tooltip placement |

Before this plan, a1813f0 committed the unfinished Codex follow-up to 01-06 (one shared 10 s IPC deadline) after
verifying it (UNAVAILABLE at 10.0 s with a 3 s port delay, then recovery).

## What works

- **Shell.** `titleBarStyle: 'hidden'` on every platform. The 40px title bar has the brand mark, «دانش», the current
  screen name and a drag region; every control is `no-drag`. On Windows/Linux there are custom minimize,
  maximize/restore and close controls (46x40, pixel-grid 10px glyphs, red close hover, dimmed when the window is
  inactive), driven by actual window state, plus a «منو» button that pops up the native application menu. In the RTL
  UI the controls sit at inline-end (physical left), as Windows does for RTL windows and where macOS draws traffic
  lights. Close goes through the normal window close path.
- **Security.** New methods (`shell.window`, `shell.windowState`, `shell.getTheme`, `shell.setTheme`,
  `shell.showAppMenu`) use the existing `danesh:shell` channel through a pure dispatcher: trust check, envelope,
  method, byte limit and strict schema run before any handler; the outputs are validated too. There are exactly three
  window actions and the preload surface is still only `call` and `on`.
- **Themes.** Main stores the preference in `ui-preferences.json`. Parsing is lenient, writes are atomic, and the size
  is capped. Main sets `nativeTheme.themeSource` and the window background before creating the window, so the first
  frame is correct. CSS follows `prefers-color-scheme`; System tracks the OS live. The Settings radio cards and the
  native «نمایش › پوسته» radio items stay in sync. Switching cross-fades with a View Transition (instant under
  reduced motion).
- **Window state.** Bounds and the maximized state persist. They are restored only when a 160x32 strip of the title
  bar lands on a connected display's work area, and are otherwise centered on the primary display. Electron's
  frameless window reports a few extra pixels at fractional scaling on Windows (measured: 1040 → 1043 at 150%);
  Main measures that drift at creation and removes it before saving, so relaunches never creep.
- **Design system.** Every color is a semantic token in `styles/tokens.css`, with independently designed warm light
  and dark palettes. Elevation, radius (4/8/12), motion durations/easings and layout sizes are also tokens.
  Components define their rest/hover/pressed/focus/selected/disabled states.
- **Sidebar/Settings.** Real destinations only (خانه, بررسی سامانه, تنظیمات), with `aria-current`, a 2px indicator
  and a collapsible 64px rail with tooltips toward the content. The collapsed state persists (localStorage, guarded),
  and the sidebar becomes a rail automatically under 880px.
- **Scrolling.** Only the content region scrolls (with a stable gutter). Scrollbars are themed and restrained but
  darken on hover; technical panels contain their overscroll; scroll position is restored per route; there is no
  wheel hijacking.
- **Shortcuts.** On Windows/Linux, Main matches Ctrl+1/2/, and zoom keys in `before-input-event` by physical key
  code. That keeps them working under a Persian layout, and `preventDefault` means nothing fires twice. macOS keeps
  its native menu accelerators.

## Actual verification (Windows 11 x64, display scale 150%)

| Check | Result |
| --- | --- |
| pnpm typecheck / lint / depcruise | Exit 0; 0 boundary violations (85 modules) |
| pnpm test | 123 tests in 14 files pass, including WCAG contrast for both themes, no color literals outside tokens, preference/bounds/dispatcher/shortcut units |
| Full E2E (fresh test build) | 24 pass, 0 fail; 42 skipped are scenarios bound to later plans (01-07+) |
| desktop-shell.feature | 8/8 pass: controls, theme persistence + size, System follows OS, malformed requests, corrupted prefs + off-screen bounds, sidebar, reduced motion, shortcuts |
| Production build + E2E | 10 selected scenarios pass on the production bundle; no test hooks present in it |
| check-features-first / check-adr / licenses:scan | failures=0 / failures=0 / failures=0 (existing binary-review warnings unchanged) |
| Visual inspection | 24 captures via `webContents.capturePage()` (light/dark × Home, System check, Settings × 1040x720, 720x520, 200% zoom; plus rail tooltip, keyboard focus, inactive window, close hover); no horizontal overflow and zero CSP violations recorded |

Defects found visually and fixed: dark captures were light because Playwright emulates a light color scheme by
default (the harness now passes `colorScheme: null`); a large focus ring on programmatically focused headings; rail
tooltips covering the neighbouring item; the menu popup opening 4px above the title bar edge. Earlier zoomed
captures were cropped by Playwright and are now taken with Electron's own capture.

Evidence: `evidence/01-17-final-verification.txt`, `evidence/01-17-visual-check.mjs`,
`evidence/01-17-visual-results.json`, `evidence/01-17-*.png`.

## Not verified here (honest scope)

- **macOS:** traffic-light position, fullscreen reservation and Cmd accelerators are implemented but **not run on
  macOS**. They belong with the CI macOS run (01-10) and Tier B (01-16).
- **OS-level pointer behavior:** double-click-to-maximize, Aero Snap drag and the right-click system menu on the drag
  region rely on native drag-region handling and need a human check. Playwright input does not reach the OS
  non-client hit-testing.
- **Physical Persian keyboard layout:** layout independence is proven by key-code unit tests plus native-path
  `sendInputEvent` E2E, not by a person typing on a Persian layout (Tier B, UC-23/26).
- **Multi-monitor:** placement logic is unit-tested with secondary/negative-coordinate displays; only one physical
  display was available.
- **Screen readers:** NVDA/Narrator/VoiceOver review of the title bar, sidebar rail and radio cards remains for the
  end-of-phase human UAT.

## Decisions recorded

- Controls at inline-end in RTL (physical left), matching Windows RTL mirroring and macOS. One CSS rule flips them for
  an LTR UI.
- Window caption buttons are excluded from the Tab order, like native ones; the «منو» button, sidebar and content
  are tabbable.
- UI preferences live in a JSON file because Main must read them synchronously before the window exists, and Main
  never opens the database (01-03 boundary).

Next executable plan: 01-07 (window/IPC hardening). It should cover the new shell methods with its rejection logging.

## Self-Check: PASSED
