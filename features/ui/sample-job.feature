# covers: apps/renderer/src/sample-job/SampleJobCard.tsx, apps/core/src/sample-job.ts
@ui @req-JOB-03 @req-PLAT-04
Feature: A clearly labelled sample job demonstrates durable progress
  Only the bundled sample file is processed, and completed chunks reflect committed tasks.

  Background:
    Given an isolated library folder whose path contains Persian letters and a space

  # n/a kind-cancellation: job pause and cancel are JOB-02 (Phase 2); UI-SPEC A-08 defines no cancel control.

  @plan-01-13 @kind-happy
  Scenario: The sample job completes twelve chunks with auditable attempts
    Given Danesh is launched with that library folder on System check
    When I press «شروع کار نمونه»
    Then progress shows «در حال انجام: بخش {k} از ۱۲» using Persian digits
    And the progress bar value text is «{k} از ۱۲ بخش انجام شد» for the committed count
    When all chunks commit
    Then the card shows «کار نمونه کامل شد. هر ۱۲ بخش انجام شد.»
    And twelve chunk cells are done and every chunk's attempt count in «جزئیات فنی» is 1
    And no user file has been read or processed

  @plan-01-13 @kind-recovery
  Scenario: Killing and relaunching the app resumes without redoing committed chunks
    Given the test build of Danesh is launched with that library folder on System check
    And the sample job has at least 3 committed chunks and one in-flight chunk
    When the app process is killed and relaunched with the same library folder
    Then the job resumes automatically
    And its banner reads «کار نمونه پیش از این نیمه‌کاره مانده بود و از بخش {k} ادامه پیدا کرد. {a} بخش انجام‌شده دوباره اجرا نشد.» with the actual Persian counts
    And completed chunks keep attempt count 1 while the interrupted chunk shows attempt count 2
    When the resumed job completes
    Then its completion notice states «{a} بخش که پیش از وقفه کامل شده بود دوباره اجرا نشد.» with the preserved count

  @plan-01-13 @kind-edge
  Scenario: Home exposes background activity only while a job runs
    Given Danesh is launched with that library folder and no sample job is running
    Then Home shows no background-activity line
    When a sample job is started from System check and I return to Home
    Then Home shows «کار نمونه در حال انجام است.» with «مشاهده»
    When the job completes
    Then the background-activity line disappears

  @plan-01-13 @kind-persistence
  Scenario: Starting again preserves the previous job record
    Given Danesh is launched with that library folder on System check
    And the sample job is completed with its job id recorded
    When I press «شروع دوبارهٔ کار نمونه»
    Then a new job record with a different id is created
    And the previous job record and its committed outputs still exist

  @plan-01-13 @kind-invalid
  Scenario: A persistent chunk failure preserves progress and offers a targeted retry
    Given the test build of Danesh is launched with that library folder on System check
    And one sample chunk is forced to fail on every attempt
    When the sample job settles after exhausting that chunk's attempt limit
    Then the card shows «کار نمونه ناموفق بود. پیشرفت شما حفظ شده است؛ می‌توانید دوباره تلاش کنید.»
    And every committed chunk stays done
    And the action is «تلاش دوبارهٔ کار نمونه»
    When the injected fault clears and I press «تلاش دوبارهٔ کار نمونه»
    Then only the failed chunk is re-run and the job completes
    And completed chunks keep their original attempt counts

  @plan-01-14 @kind-recovery
  Scenario: An engine crash retries only the in-flight chunk
    Given the test build of Danesh is launched with that library folder on System check
    And the sample job has committed chunks and one running chunk
    When the sample engine host is killed mid-chunk
    Then the host restarts after backoff and the job completes
    And committed chunks keep attempt count 1
    And only the interrupted chunk acquires another attempt

  @plan-01-13 @kind-edge
  Scenario: The idle card clearly discloses the sample scope
    Given Danesh is launched with that library folder on System check and no sample job exists
    Then the card title is «کار نمونهٔ پایدار» with the tag «آزمایشی»
    And its description is «این یک کار آزمایشی است و به فایل‌های شما ربطی ندارد. فقط نشان می‌دهد که کارها بعد از بسته شدن یا خرابی برنامه از همان‌جا ادامه پیدا می‌کنند.»
    And «شروع کار نمونه» is available and no chunk strip or pause or cancel control is shown

  @plan-01-13 @kind-edge
  Scenario Outline: Chunk counts remain readable and expose non-color state cues
    Given the test build of Danesh is launched with that library folder on System check
    And a sample-job snapshot contains <count> chunks
    When the card renders at the minimum window width
    Then the strip contains exactly <count> cells wrapping toward inline-end without horizontal scroll
    And done, running and pending cells have different shapes and their specified Persian hidden text
    And primary counts use Persian digits while technical attempt counts use ASCII digits

    Examples:
      | count |
      | 1     |
      | 12    |
      | 64    |
