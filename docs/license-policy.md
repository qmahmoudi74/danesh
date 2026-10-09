# Dependency license policy and reviewed exceptions

Danesh's original code is MIT (ADR 0004). D-02's permissive-only dependency policy remains the default. Third-party packages, embedded native components, models, voices and probe assets retain their own licenses. GPL, AGPL, LGPL, unknown licenses and non-commercial assets remain excluded; no general MPL, Creative Commons or WTFPL allowance is introduced here.

## User-approved exceptions for Plan 01-02

The user approved the following named exceptions after reviewing the exact dependency pins and frozen lockfile. The authorization is retained in `.planning/phases/01-secure-durable-foundation-packaging-gate/evidence/01-02-user-approval.md`. The scope is this reviewed package/version set; upgrades and additional packages require new review.

| Package/version | License | Approved scope and conditions |
| --- | --- | --- |
| lightningcss 1.32.0 and its eleven locked platform packages at 1.32.0 | MPL-2.0 | Build-time tooling only. Preserve license and source attribution. Do not distribute these packages or covered code in the application without separate review; if distribution is proposed, record applicable source-access and notice obligations. |
| spdx-exceptions 2.5.0 | CC-BY-3.0 | SPDX exception-list data. Preserve published attribution and license text, identify the upstream source and retain any modification notices. |
| spdx-ranges 2.1.1 | MIT AND CC-BY-3.0 | Preserve both the MIT notice and the published CC-BY attribution/license for the included SPDX data; the AND expression requires both. |
| truncate-utf8-bytes 1.0.2 | WTFPL | Conditional on confirming its published license text. Retain that text and copyright notice; do not extend this exception to other versions or packages. |

The platform packages are: lightningcss-android-arm64, lightningcss-darwin-arm64, lightningcss-darwin-x64, lightningcss-freebsd-x64, lightningcss-linux-arm-gnueabihf, lightningcss-linux-arm64-gnu, lightningcss-linux-arm64-musl, lightningcss-linux-x64-gnu, lightningcss-linux-x64-musl, lightningcss-win32-arm64-msvc and lightningcss-win32-x64-msvc. Every approved version is 1.32.0, including packages not installed on this Windows host.

## Notice preservation

Retain verbatim published license, attribution and applicable NOTICE files for the named exceptions and installed Apache-2.0 dependencies. Vazirmatn's OFL-1.1 license text must be retained and shipped. Record package versions, upstream sources, source paths and SHA-256 values alongside retained copies under `third_party/`. Do not claim a metadata license declaration proves the contents of a native binary.

The future Plan 01-05 license scan must incorporate these exact reviewed exceptions with the user's approval record and obligations. Its default allowlist must stay restrictive. An exception is matched to its approved package and version, not just its license identifier. This document records the policy decision; it does not implement or execute Plan 01-05.

## Distribution boundary

`apps/desktop` declares native/runtime packages as dependencies and build tooling as devDependencies. The MPL exception covers the Tailwind/Lightning CSS build graph only. Check the resolved production dependency graph for accidental reachability, and separately inspect actual packaged archives and unpacked resources before any distribution. A production graph check alone does not prove absence from a bundle or packaged artifact.

No distributed application artifact exists in Plan 01-02. Actual archive and resource inspection therefore remains a required packaging check in Plan 01-08 and the phase's release gate. Flag any restricted-license component found in a packaged application for separate review before distributing it. Do not add packaging configuration or run later plans to claim that check passed now.
