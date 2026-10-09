# Tier B verification: Windows 11 x64 with a Persian-named profile

Tier B is a human run on a clean machine (decisions D-05, D-06). CI (Tier A) runs on hosted Windows Server images and
cannot show what a real Windows 11 user with a Persian profile name sees. Windows is reported **verified** only when
this evidence is returned.

## Prerequisites

- A Windows 11 x64 machine or virtual machine on which you may create a local user (administrator rights).
- The installer built from the commit under test: `apps/desktop/dist/Danesh Setup 0.1.0.exe`, produced by
  `pnpm package`. Record its SHA-256 (`certutil -hashfile "Danesh Setup 0.1.0.exe" SHA256`) in your notes file.
- A Persian keyboard layout installed (Settings › Time & language › Language & region).

Danesh never creates or changes operating-system accounts or settings. The steps below are for you to perform.

## Steps

1. Create a local user whose name contains Persian letters **and** a space, for example «کاربر آزمون دانش»
   (Settings › Accounts › Other users, or `net user "کاربر آزمون دانش" /add` in an administrator prompt).
2. Sign in as that user. Confirm that `%USERPROFILE%` contains the Persian name.
3. Copy the installer into that profile and run it with the default options (per-user install). An "unrecognized app"
   SmartScreen prompt is expected for this unsigned foundation build (D-08); choose to run it anyway.
4. Launch «دانش» from the Start menu. Confirm that Home shows «دانش» and the banner «نسخهٔ پایه؛ امکانات مطالعه هنوز
   در دسترس نیست». Take screenshot `home.png`.
5. Open «بررسی سامانه» and press «اجرای بررسی». While the engine rows run, type and scroll in the window and note
   whether it stays responsive.
6. When the run finishes, take screenshot `results.png` showing the full result list (scroll if needed). Expand
   «اطلاعات محیط اجرا» and take `environment.png` with the library path visible.
7. Press «ذخیرهٔ گزارش» and save the report as `system-check.json`.
8. With the Persian keyboard layout active, press Ctrl+1 and Ctrl+2. Record whether each one switches between Home and
   System check (finding UC-23). If they do not, record whether the «منو» button › «نمایش» menu reaches both routes.
9. Open «منو» in the title bar and confirm that the Persian menu labels are legible and in logical order (UC-26). Take
   `menu.png`.
10. Optional: run with the Windows Firewall log or a packet capture enabled and note whether Danesh made any outbound
    connection (it should make none).
11. Uninstall Danesh (Settings › Apps), then sign out. Delete the test user if you no longer need it.

## Evidence to return

Place these files in `.planning/phases/01-secure-durable-foundation-packaging-gate/evidence/tier-b-windows/`:

| File | Content |
| --- | --- |
| `system-check.json` | The report exported in step 7 |
| `home.png`, `results.png`, `environment.png`, `menu.png` | Screenshots from steps 4, 6 and 9 |
| `notes.md` | Windows edition and build (`winver`), the test user name, the installer SHA-256, the responsiveness observation, UC-23 and UC-26 findings, and any surprise |

The returned report must pass:

```
node tools/smoke/validate-evidence.ts --file .planning/phases/01-secure-durable-foundation-packaging-gate/evidence/tier-b-windows/system-check.json --require-persian-path --require-os win32 --require-check database --require-check engine-llm --require-check engine-ocr --require-check engine-tts --require-check ui-responsive --require-check fuses
```
