# covers: apps/renderer/src/screens/SystemCheck.tsx, apps/core/src/system-check.ts, apps/main/src/shell-ipc.ts
@ui @req-REL-02 @req-PLAT-03 @req-PLAT-11
Feature: Local System check with visible results and JSON export
  Check rows preserve report order and never claim success for checks that did not run.

  Background:
    Given an isolated library folder whose path contains Persian letters and a space

  @plan-01-12 @req-PLAT-08 @kind-persistence
  Scenario: Core verifies a persistent content-addressed blob
    Given Danesh is launched with that library folder on System check
    When I run System check
    Then the blob storage row passes in report position three
    And its reported SHA-256 names a real verified blob in the library

  @plan-01-06 @kind-happy
  Scenario: System check waits for an explicit first run
    Given Danesh is launched with that library folder
    When I open System check before any run
    Then the empty heading is «هنوز بررسی انجام نشده»
    And the empty body is «برای دیدن وضعیت بخش‌های اصلی برنامه، بررسی را اجرا کنید.»
    And «اجرای بررسی» is available and no check has started automatically
    And «ذخیرهٔ گزارش» is disabled with visible reason «پس از اجرای بررسی فعال می‌شود.»

  @plan-01-06 @kind-happy
  Scenario: Running updates each row and announces the actual summary
    Given Danesh is launched with that library folder on System check
    When I press «اجرای بررسی»
    Then the Run control reads «در حال بررسی…» and cannot be re-triggered
    And each reported row moves from «در انتظار» through «در حال اجرا» to its final status
    And rows remain in report order throughout the run
    When the run completes
    Then zero failed rows yield the summary «همهٔ بررسی‌ها موفق بود»
    And any failed rows yield «{n} بررسی ناموفق بود. برای هر مورد، توضیح و راه‌حل زیر آن نوشته شده است.» with the actual count in Persian digits
    And focus stays on the Run control, now labelled «اجرای دوباره»

  @plan-01-06 @kind-edge
  Scenario: A slow run gives a hint without allowing duplicate execution
    Given the test build of Danesh is launched with that library folder on System check
    And a test check is held running for more than 10 seconds
    When I start the run and wait 10 seconds
    Then «اولین اجرا ممکن است کمی طول بکشد.» appears
    And Run remains disabled until the run settles

  @plan-01-06 @kind-edge
  Scenario: The environment block preserves a Persian path with an apostrophe
    Given the library folder also contains an apostrophe
    And Danesh is launched with that exact library folder
    When I open «اطلاعات محیط اجرا» on System check
    Then the exact library path appears inside an LTR isolate
    And app version, Electron version, OS name, OS version, architecture and system locale are shown

  @plan-01-06 @kind-persistence
  Scenario: Exported JSON matches the displayed report
    Given the test build of Danesh is launched with that library folder on System check
    And a System check run has completed
    And Main's save dialog is stubbed to select a writable report file
    When I press «ذخیرهٔ گزارش»
    Then the control reads «در حال ذخیره…» and is disabled while saving
    And the saved JSON validates against the smoke-report schema
    And its check ids, statuses and order equal those displayed on screen
    And «گزارش ذخیره شد.» is announced and focus returns to «ذخیرهٔ گزارش»

  @plan-01-06 @kind-invalid
  Scenario: An unwritable export target reports an actionable error
    Given the test build of Danesh is launched with that library folder on System check
    And a run has completed and Main's save dialog selects an unwritable location
    When I press «ذخیرهٔ گزارش»
    Then the status region announces «ذخیرهٔ گزارش انجام نشد. مسیر دیگری را امتحان کنید یا فضای خالی دیسک را بررسی کنید.»
    And no stack trace or raw error is shown outside technical details

  @plan-01-06 @kind-cancellation
  Scenario: Cancelling the save dialog is silent
    Given the test build of Danesh is launched with that library folder on System check
    And a System check run has completed
    When I press «ذخیرهٔ گزارش» and cancel Main's save dialog
    Then no report file is written and no export message is announced
    And focus returns to «ذخیرهٔ گزارش»

  @plan-01-06 @kind-recovery
  Scenario: An unreachable Core offers a named retry that recovers the run
    Given the test build of Danesh is launched with that library folder on System check
    And Core is unreachable
    When I press «اجرای بررسی»
    Then a run-level alert reads «ارتباط با بخش اصلی برنامه برقرار نشد. دوباره تلاش کنید؛ اگر مشکل ماند، برنامه را ببندید و دوباره باز کنید.»
    And its action is «تلاش دوبارهٔ بررسی»
    When Core becomes reachable and I press «تلاش دوبارهٔ بررسی»
    Then the run completes and the unreachable-Core alert clears

  @plan-01-06 @kind-edge
  Scenario: Partial reports retain their rows and render unknown ids honestly
    Given the test build of Danesh is launched with that library folder on System check
    When a test report contains pass and fail rows plus an unknown check id
    Then failures are not sorted ahead of the report order
    And no absent check is displayed as passed
    And the unknown id is displayed inside an LTR isolate with the generic result sentence
    And every status shows its Persian word alongside its icon

  @plan-01-08 @kind-edge
  Scenario: The test build reports its differing security fuses
    Given the packaged test build of Danesh is launched with that library folder on System check
    When I run System check
    Then «قفل‌های امنیتی برنامه» shows «ناموفق»
    And its sentence is «تنظیمات امنیتی با نسخهٔ نهایی مطابقت ندارد. این نسخه برای آزمایش ساخته شده است.»

  @plan-01-09 @kind-happy
  Scenario: Each packaging probe runs in its own host and reports its hash
    Given Danesh is launched with that library folder and all three bundled probe assets are available
    When I run System check
    Then «موتور مدل زبانی (نمونهٔ آزمایشی)», «موتور تشخیص متن (نمونهٔ آزمایشی)» and «موتور گفتار (نمونهٔ آزمایشی)» show «موفق»
    And each row's technical details contain a distinct host process id and a lowercase 64-hex output SHA-256
    And the host ids differ from Main, Core and the renderer
    And model names, versions and hashes appear only inside «جزئیات فنی»

  @plan-01-09 @kind-edge
  Scenario: The interface stays responsive while all probes work
    Given Danesh is launched with that library folder on System check
    When the LLM, OCR and TTS probes run concurrently
    Then navigation and keyboard input remain responsive
    And «پاسخ‌گویی برنامه» shows «موفق»
    And its technical details report at least 100 heartbeat samples, p95 lateness at most 50 ms and maximum lateness at most 250 ms

  @plan-01-09 @kind-recovery
  Scenario: A crashing OCR probe fails only its row
    Given the test build of Danesh is launched with that library folder on System check
    And the check-run fixture supplies successful results for the other checks
    And the OCR probe is forced to crash on every execution in this run
    When I run System check
    Then only «موتور تشخیص متن (نمونهٔ آزمایشی)» shows «ناموفق»
    And every other expected row is still reported
    And the summary reads «۱ بررسی ناموفق بود. برای هر مورد، توضیح و راه‌حل زیر آن نوشته شده است.»

  @plan-01-15 @kind-happy
  Scenario Outline: The full local check lists the OS rows in documented order
    Given Danesh's production check configuration is exercised on <os> with that library folder
    When every check finishes successfully
    Then «اتصال به اینترنت» shows «موفق» and no outbound connection is made
    And the report has <count> rows in order "app-launch, database, cas-storage, engine-llm, engine-ocr, engine-tts, ui-responsive, egress-zero, fuses"
    And the "codesign" row is appended only on macOS
    And the summary is «همهٔ بررسی‌ها موفق بود»

    Examples:
      | os      | count |
      | Windows | 9     |
      | macOS   | 10    |
