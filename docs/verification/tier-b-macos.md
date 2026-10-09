# Tier B verification: macOS 13+ on Apple Silicon (clean account)

macOS is **never** reported verified without this evidence (D-06). CI runs a hosted macOS image (Tier A). That proves
the build and the packaged smoke test run, but not what a person sees on a clean Mac.

## Prerequisites

- An Apple Silicon Mac (or VM) on macOS 13 or later, with a clean user account that has never run Danesh.
- The DMG from the commit under test: either download the `evidence-macos-latest` artifact of the CI run, or build it
  on a Mac with `pnpm install --frozen-lockfile && pnpm probes:fetch && pnpm package`
  (`apps/desktop/dist/Danesh-0.1.0-arm64.dmg`). Record its SHA-256 (`shasum -a 256 <file>`) in your notes.
- A Persian keyboard input source (System Settings › Keyboard › Input Sources).

## Steps

1. Sign in to the clean account. Open the DMG and drag Danesh to Applications.
2. The foundation build is ad-hoc signed and not notarized (D-08). Open it with right-click › Open, then confirm. Do
   **not** use `spctl --assess`; it is expected to reject ad-hoc signatures.
3. In Terminal run `codesign --verify --deep --strict --verbose=2 /Applications/Danesh.app` and save the full output
   as `codesign.txt`.
4. Confirm Home and the foundation banner; take `home.png`. Confirm that the window keeps the native traffic lights at
   the top left of the custom title bar. Enter and leave full screen, then take `fullscreen.png` while in full screen.
5. Open «بررسی سامانه», press «اجرای بررسی», and type and scroll while the engine rows run. Take `results.png` and
   `environment.png` (library path visible). Save the report with «ذخیرهٔ گزارش» as `system-check.json`.
6. With the Persian input source active, press Cmd+1, Cmd+2 and Cmd+, and record whether each one navigates (UC-23).
7. Open the menu bar's «نمایش» menu, confirm the Persian labels are legible and in logical order (UC-26), and take
   `menu.png`.
8. Quit Danesh and delete it from Applications.

## Evidence to return

Place these files in `.planning/phases/01-secure-durable-foundation-packaging-gate/evidence/tier-b-macos/`:

| File | Content |
| --- | --- |
| `system-check.json` | The report exported in step 5 |
| `codesign.txt` | Output of step 3 |
| `home.png`, `fullscreen.png`, `results.png`, `environment.png`, `menu.png` | Screenshots from steps 4, 5 and 7 |
| `notes.md` | macOS version, chip, DMG SHA-256, first-launch behavior, responsiveness, UC-23 and UC-26 findings, and any surprise |

The returned report must pass:

```
node tools/smoke/validate-evidence.ts --file .planning/phases/01-secure-durable-foundation-packaging-gate/evidence/tier-b-macos/system-check.json --require-os darwin --require-check database --require-check engine-llm --require-check engine-ocr --require-check engine-tts --require-check ui-responsive --require-check fuses --require-check codesign
```
