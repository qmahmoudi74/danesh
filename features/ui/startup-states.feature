# covers: apps/core/src/boot.ts, apps/renderer/src/screens/Home.tsx
@ui @req-PLAT-06 @req-PLAT-07 @req-PLAT-04
Feature: Startup preserves data and exposes honest recovery states
  Blocking states keep System check reachable without silently modifying the library.

  Background:
    Given an isolated library folder whose path contains Persian letters and a space

  # n/a kind-cancellation: start-up has no user-cancellable step.

  @plan-01-11 @kind-happy
  Scenario: Normal startup applies pending migrations before the foundation banner
    Given that library contains a database with a valid pending migration
    When Danesh is launched with that library folder and Core becomes ready
    Then the pending migration has been applied
    And Home shows «نسخهٔ پایه؛ امکانات مطالعه هنوز در دسترس نیست»

  @plan-01-11 @kind-invalid
  Scenario: A newer database is refused without changing its bytes
    Given that library contains a database from a newer Danesh with its SHA-256 recorded
    When Danesh is launched with that library folder
    Then Home shows «این داده‌ها با نسخهٔ جدیدتری از دانش ساخته شده‌اند»
    And the database file's SHA-256 is unchanged
    And database and supported schema versions appear only in «جزئیات فنی»
    And «بررسی سامانه» remains reachable through Home and the sidebar

  @plan-01-11 @kind-recovery
  Scenario: Failed migration opens read-only and preserves prior rows
    Given that library contains prior rows and a pending migration that will fail
    When Danesh is launched with that library folder
    Then Home shows «برنامه در حالت فقط‌خواندنی باز شد»
    And «جزئیات فنی» shows the verified backup file path and failed migration id
    And those technical values are absent from the primary Persian message
    And a write request is refused with READ_ONLY (the sample job will use the same guard in a later plan)
    And the prior rows are intact and «بررسی سامانه» remains reachable

  @plan-01-11 @kind-persistence
  Scenario: An upgrade keeps data and takes no second backup on relaunch
    Given that library contains known rows at the previous schema version
    When Danesh is launched with that library folder and completes its upgrade
    Then the known rows are preserved and "backups/" gains exactly one file
    When Danesh is closed and relaunched with the same library folder
    Then the known rows remain and no additional backup is created

  @plan-01-07 @kind-edge
  Scenario: A second instance focuses the first without opening another Core
    Given Danesh is already launched with that library folder
    When a second instance is launched with the same library folder
    Then the second process exits and the first window receives focus
    And exactly one Core process has the library open

  @plan-01-14 @kind-recovery
  Scenario: Repeated Core boot failures offer app relaunch
    Given the test build forces Core to fail at boot 3 times within 60000 ms
    When Danesh is launched with that library folder
    Then Home shows «بخش اصلی برنامه اجرا نشد» with «راه‌اندازی دوباره»
    And «جزئیات فنی» shows the logs folder path
    And «بررسی سامانه» remains reachable through Home and the menu

  @plan-01-06 @kind-edge
  Scenario: Slow preparation keeps System check available
    Given the test build delays Core readiness for more than 5 seconds
    When Danesh is launched with that library folder
    Then Home initially shows «در حال آماده‌سازی…» with a running spinner
    And after 5 seconds it also shows «آماده‌سازی کمی طول کشید؛ لطفاً صبر کنید.»
    And «بررسی سامانه» stays enabled throughout
    When Core reports ready
    Then the preparation messages clear and the foundation banner appears
