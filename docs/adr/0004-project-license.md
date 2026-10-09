---
status: accepted
date: 2026-10-09
decision-makers: the user (product owner); recorded by the planning workflow
kind: license
---

# 0004: Project license: MIT

## Context and Problem Statement

Danesh is intended to have a public source repository. REL-08 requires an explicit project license decision recorded before any engine ADR is accepted. D-01 considered Apache-2.0, MIT and AGPL-3.0-or-later. The user chose MIT on 2026-10-09; this ADR records that decision without reopening it. No publication or push is authorized by this record.

## Decision Drivers

- Make Danesh's original source available under a clear, permissive grant.
- Preserve third-party license boundaries and the permissive-only dependency gate D-02.
- Keep distribution compatible with the commercial-safe default while D-COMMERCIAL remains open.
- Record the decision and canonical license source for review and later packaging.

## Considered Options

- **MIT:** a short permissive grant with copyright and permission-notice preservation; it has no explicit patent grant. Chosen by the user.
- **Apache-2.0:** a permissive grant with explicit patent terms; it adds attribution, change-notice and applicable NOTICE obligations. Not chosen for Danesh's original source.
- **AGPL-3.0-or-later:** reciprocal source obligations, including applicable network use, support a different distribution policy; it conflicts with the chosen permissive project direction. Not chosen.

## Decision Outcome

Danesh's original source code is licensed under MIT. Third-party dependencies, engines, models, voices and probe assets keep their own licenses; the project MIT grant does not relicense any of them.

The permissive-only dependency gate D-02 remains in force after the MIT decision. MuPDF (AGPL) and espeak-ng (GPL) cannot ship in default builds. Plan 01-05's license scan must reject GPL, AGPL, LGPL and unknown licenses, including embedded native code; a permissive JavaScript wrapper does not establish the license of its bundled binaries.

During Plan 01-02 execution, the user separately approved exact package/version exceptions recorded in `docs/license-policy.md`: lightningcss 1.32.0 and its locked platform packages under MPL-2.0 for build-time tooling only; spdx-exceptions 2.5.0 under CC-BY-3.0; spdx-ranges 2.1.1 under MIT AND CC-BY-3.0; and truncate-utf8-bytes 1.0.2 under WTFPL, conditional on checking its published text. These exceptions do not add their license identifiers to the global allowlist or change the project MIT grant. Their notices and attribution must be retained, and any restricted-license component found in a packaged application requires separate review. The full user approval is retained in the Plan 01-02 evidence directory.

Apache-2.0 dependencies require preservation of applicable NOTICE files and their license texts. OFL-1.1 fonts, including Vazirmatn, require their license text to ship. Non-commercial model or voice licenses, including CC-BY-NC and Coqui CPML, remain excluded while D-COMMERCIAL is open. No model or voice is selected or downloaded by this decision.

Confirmation is through Plan 01-05's dependency/license scan and `third_party/THIRD-PARTY-NOTICES.txt`, followed by Plan 01-08's packaging verification of LICENSE and third-party notices. Those checks have not run yet; this ADR accepts the user's project license decision, not a completed dependency audit.

## Spike Evidence

Not applicable: product decision; no spike.

Pass policy commit: n/a

## License

The root LICENSE uses the canonical SPDX MIT permission notice and warranty disclaimer, changing only the template copyright line to `Copyright (c) 2026 Danesh contributors`.

- SPDX source: https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/MIT.txt
- Fixed tag: `v3.27.0`
- SHA-256 of the fetched source bytes: `b05785f9f18e6716bab63424b11454513b9943a222595b70411009202fc592b5`
- Source size: 1,078 bytes; fetched on the developer machine during Plan 01-02 preparation.
- Retained source: `.planning/phases/01-secure-durable-foundation-packaging-gate/evidence/01-02-spdx-MIT.txt`

The previously removed LICENSE from commit `b2016c7` is not restored. Both assembly and root manifests declare MIT for Danesh's original code.

## Packaging

Plan 01-08 must ship LICENSE and `third_party/THIRD-PARTY-NOTICES.txt` under `resources/licenses/`, together with required third-party license and notice files. No packaged artifact or notice-completeness claim is made here.

## Security

None: this is a product license decision. Package legitimacy, install-script controls and network consent remain separate enforced gates.

## Pros and Cons of the Options

MIT gives the chosen minimal permissive grant and requires notice preservation, without Apache-2.0's explicit patent terms. Apache-2.0 would add those terms and notice obligations. AGPL-3.0-or-later would impose reciprocity that the user did not choose. None of the options changes third-party licensing.

## More Information

This accepted license ADR precedes every accepted engine ADR; `tools/check-adr.ts` from Plan 01-05 enforces that order. ADRs 0001-0003 remain proposed pending their governed packaging evidence.

The decision is recorded in `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md` (REL-08), and the resolved D-01 note in `.planning/phases/01-secure-durable-foundation-packaging-gate/01-CONTEXT.md`. Released MIT grants cannot be revoked for already released versions; relicensing requires every contributor's consent.
