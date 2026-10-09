# covers: apps/main/src/index.ts, apps/main/src/protocol.ts, apps/main/src/window.ts, apps/preload/src/index.ts, apps/renderer/src/main.tsx, apps/core/src/index.ts
@ui @req-PLAT-01 @req-PLAT-02 @req-PLAT-03
Feature: An honest Persian-first shell behind a closed preload API
  The foundation window exposes real diagnostics while keeping Node and backend ports private.

  Background:
    Given an isolated library folder whose path contains Persian letters and a space

  # n/a kind-cancellation: the shell exposes no cancellable operation in Phase 1 (job cancel is JOB-02, Phase 2).

  @plan-01-03 @kind-happy
  Scenario: System check reaches the database through Core
    Given Danesh is launched with that library folder
    When I open System check and press «اجرای بررسی»
    Then the «اجرای برنامه» and «پایگاه داده» rows show «موفق»
    And their technical details record a Core process id different from the window's renderer process id

  @plan-01-03 @kind-invalid
  Scenario: The page has no Node access or raw IPC surface
    Given Danesh is launched with that library folder
    When the page's runtime surface is inspected
    Then "typeof require" and "typeof process" are both "undefined"
    And "window.danesh" exposes only "call" and "on"
    And neither ipcRenderer nor the private MessagePort is exposed to the page

  @plan-01-03 @kind-edge
  Scenario: Core and the sample host run in separate processes
    Given the test build of Danesh is launched with that library folder
    When a test-only echo travels through Core to the sample engine host
    Then the returned host process id differs from Core, Main and the window's renderer process ids

  @plan-01-03 @kind-persistence
  Scenario: The database probe row survives a relaunch
    Given Danesh is launched with that library folder
    And one System check run has written a database probe row
    When the app is closed and reopened with the same library folder
    And I run System check again
    Then the database check reads the probe row written by the first run

  @plan-01-06 @kind-happy
  Scenario: Home states the foundation scope in Persian
    Given Danesh is launched with that library folder and Core is ready
    Then the document has lang "fa" and dir "rtl"
    And the heading and window title are «دانش»
    And the banner title is «نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست»
    And the only action in the Home content is «بررسی سامانه»
    And the Home content has no import, reader, curriculum or search control
    And no disabled study-feature placeholder is shown

  @plan-01-06 @kind-edge
  Scenario: Keyboard navigation focuses the heading and unknown routes return Home
    Given Danesh is launched with that library folder
    When I press CmdOrCtrl and the physical 2 key
    Then the route is "#/system-check" and its h1 «بررسی سامانه» has focus
    And the window title is «بررسی سامانه — دانش»
    When an unknown hash route is selected
    Then Home is rendered with the heading and window title «دانش»

  @plan-01-07 @kind-invalid
  Scenario: A malformed ping is rejected without logging Persian input
    Given the test build of Danesh is launched with that library folder
    When "system.ping" receives a non-integer Persian string directly at Core
    Then the request fails with INVALID_INPUT
    And "logs/core.jsonl" gains a record with schema "system.ping", sender "renderer", error class and byte length
    And the log contains neither the Persian string nor its escaped representation

  @plan-01-07 @kind-edge
  Scenario: Both routes obey CSP and reject external navigation
    Given the test build of Danesh is launched with that library folder
    When Home and System check are visited while CSP violations are recorded
    Then zero "securitypolicyviolation" events are recorded
    When page navigation to "https://example.com" is attempted
    Then navigation is blocked before any external connection
    And "window.open" for that URL returns null
    And the page remains on the app origin "app://danesh"

  @plan-01-07 @kind-recovery
  Scenario: A rejected call leaves the private connection usable
    Given Danesh is launched with that library folder
    When a malformed call is rejected
    And a valid "system.ping" call is sent immediately afterwards
    Then the valid ping succeeds on the same connection
