# covers: packages/engines/pdf/src/layout.ts, packages/engines/pdf/src/normalize.ts, packages/engines/pdf/src/host.ts, packages/storage/src/extraction.ts, apps/core/src/extraction.ts, apps/renderer/src/components/TextReader.tsx
@ui @req-DOC-06 @req-DOC-07 @req-DOC-08 @req-DOC-09 @req-READ-02
Feature: Extract a PDF's text and read it in Danesh
  Early Phase 2 increment (owner-authorized): page text is extracted in an isolated process, rebuilt into headings
  and paragraphs in logical reading order, stored with page provenance and quality flags, and read as selectable
  Persian-first text. The reconstruction is provisional and says so; nothing missing is invented.

  Background:
    Given an isolated library folder whose path contains Persian letters and a space

  @plan-pdf-02 @kind-happy @kind-persistence
  Scenario: A Persian and English PDF is extracted, read, and still readable after a relaunch
    Given Danesh is launched with that library folder
    And the fixture «persian-mixed.pdf» has been imported
    When I open it in the semantic Reader
    And I start the extraction
    Then extraction progress is shown per page until all 3 pages are done
    And the reader shows the heading «فصل ۱: آشنایی با کتابخانهٔ دانش» and Persian paragraphs in logical order
    And the mixed sentence keeps «E = mc²» and «x ≤ 10» intact
    And page 3 is marked as needing OCR
    And every block carries its page number
    And the reader's text can be selected and copied
    When I inspect the original excerpt for the mixed sentence
    Then its stored raw text and source-block provenance are shown without a PDF page viewer
    When Danesh is closed and relaunched with the same library folder
    Then opening the document's extracted text shows the same blocks without extracting again

  @plan-pdf-02 @kind-edge
  Scenario: An English PDF reads left to right with its headings
    Given Danesh is launched with that library folder
    And the fixture «english-report.pdf» has been imported
    When I open it in the semantic Reader
    And I start the extraction
    Then the reader shows the heading «Results» and the paragraph text in left-to-right blocks

  @plan-pdf-02 @kind-recovery
  Scenario: An extraction interrupted by closing Danesh can be continued
    Given the test build of Danesh is launched with that library folder
    And the fixture «persian-mixed.pdf» has been imported
    And its extraction stopped after page 1 when Danesh closed
    When Danesh is closed and relaunched with the same library folder
    And I open it in the semantic Reader
    Then the extraction is shown as interrupted after 1 of 3 pages
    When I continue the extraction
    Then all 3 pages are extracted and page 1 was not extracted twice

  @plan-pdf-02 @kind-invalid
  Scenario: A changed original is not extracted
    Given Danesh is launched with that library folder
    And the fixture «english-report.pdf» has been imported
    And the stored original has been altered on disk
    When I open it in the semantic Reader
    And I start the extraction
    Then Danesh says the stored file failed its integrity check and nothing was extracted

  # n/a kind-cancellation: extraction has no cancel action yet; closing Danesh stops it and the interrupted
  # scenario covers continuing. A cancel control arrives with the durable job kernel (Plan 01-13).
