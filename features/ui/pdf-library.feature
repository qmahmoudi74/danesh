# covers: packages/storage/src/documents.ts, apps/core/src/documents.ts, packages/engines/pdf/src/pdf.ts, apps/renderer/src/screens/Library.tsx
@ui @req-DOC-01 @req-DOC-02 @req-DOC-03 @req-DOC-05
Feature: Import a PDF into the Library and open its semantic Reader
  Originals remain immutable evidence. The confirmed v1 experience displays reconstructed content,
  never an embedded PDF page viewer or page-navigation controls.

  Background:
    Given an isolated library folder whose path contains Persian letters and a space

  @plan-pdf-01 @kind-happy @kind-persistence
  Scenario: An imported PDF opens the semantic Reader and survives a relaunch
    Given Danesh is launched with that library folder
    When I choose «افزودن PDF» and pick the 3-page file «کتاب نمونه.pdf» titled «مبانی Danesh»
    Then the Library lists «مبانی Danesh» with 3 pages
    And the original bytes are stored once in the content-addressed store
    When I open «مبانی Danesh» from the Library
    Then the semantic Reader offers extraction without PDF viewing or page navigation
    When Danesh is closed and relaunched with the same library folder
    Then the Library still lists «مبانی Danesh» once
    And opening it offers semantic extraction

  @plan-pdf-01 @kind-edge
  Scenario: Importing the same content again opens the existing entry
    Given Danesh is launched with that library folder
    And the 3-page file «کتاب نمونه.pdf» has been imported
    When I import the same bytes again under the name «copy.pdf»
    Then the Library still lists exactly one document
    And Danesh says it was already in the Library

  @plan-pdf-01 @kind-invalid
  Scenario Outline: An unusable file is refused with a plain Persian reason and nothing is added
    Given Danesh is launched with that library folder
    When I choose «افزودن PDF» and pick a <kind> file
    Then Danesh shows «<message>»
    And the Library is still empty

    Examples:
      | kind       | message                                                              |
      | non-PDF    | این فایل PDF نیست.                                                   |
      | encrypted  | این PDF رمزدار است. فعلاً فقط PDFهای بدون رمز را می‌توان افزود.      |
      | damaged    | این PDF آسیب دیده است و خوانده نشد.                                  |

  @plan-pdf-01 @kind-cancellation
  Scenario: Cancelling the file picker changes nothing
    Given Danesh is launched with that library folder
    When I choose «افزودن PDF» and cancel the file picker
    Then no message is shown
    And the Library is still empty

  # n/a kind-recovery: import is a single atomic step (the blob is published atomically, then one row is inserted);
  # interrupted-import resume belongs to the durable job kernel (Plan 01-13).
