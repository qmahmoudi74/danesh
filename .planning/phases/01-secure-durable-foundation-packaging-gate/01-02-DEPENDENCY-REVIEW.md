# Plan 01-02 dependency approval checkpoint

Status: both close-out blockers resolved; required final verification is being rerun. Historical checkpoint and first-install evidence below remain retained.

## Explicit approval and scoped exceptions

The user approved keeping the existing dependencies and the exact reviewed lockfile (SHA-256 `3fca83b35d0995ceb52a9b3b1c10caf6c62aa0627737d9012674c84d9923e157`). The full approval, including stopping conditions, is retained in [the approval record](evidence/01-02-user-approval.md).

- lightningcss 1.32.0 and its locked platform packages: MPL-2.0 exception for build-time tooling only; any packaged inclusion requires separate review.
- spdx-exceptions 2.5.0: CC-BY-3.0, with published attribution and license preservation.
- spdx-ranges 2.1.1: MIT AND CC-BY-3.0, preserving both sets of obligations.
- truncate-utf8-bytes 1.0.2: WTFPL, conditional on confirming its published license text after installation.

These package/version exceptions are recorded in [the license policy](../../../docs/license-policy.md). They do not globally allow MPL, CC-BY or WTFPL, and do not relax the GPL/AGPL/LGPL, unknown-license or non-commercial restrictions. No additional lifecycle script, engine/model download outside the reviewed packages, version change, later plan or publication is approved.

## Prepared result

The root and desktop manifests contain 31 exact direct pins matching the approved plan. Both newest stable 19.x React type packages observed during authoring are 19.3.0. All 31 `npm view NAME@VERSION version --registry=https://registry.npmjs.org/ --json` calls returned exit 0 and the expected version. Registry metadata requests for all 737 unique locked package/version entries returned HTTP 200. Only public npm registry metadata, attestations and the fixed-tag SPDX license text were fetched.

Before the checkpoint, no package tarball, dependency script, Electron binary, browser, model or probe was downloaded or executed, and neither root nor desktop node_modules existed. Approved installation proceeds only after the recorded user reply. Plan 01-01's three task commits precede every application manifest.

## Exact direct pins and sources

### Desktop runtime

| Package / npm source | Exact version | Declared license | Publisher | Provenance |
| --- | --- | --- | --- | --- |
| [better-sqlite3](https://www.npmjs.com/package/better-sqlite3/v/13.0.3) | 13.0.3 | MIT | GitHub Actions | Published; metadata matched |
| [node-llama-cpp](https://www.npmjs.com/package/node-llama-cpp/v/3.22.1) | 3.22.1 | MIT | GitHub Actions | Published; metadata matched |
| [onnxruntime-node](https://www.npmjs.com/package/onnxruntime-node/v/1.30.0) | 1.30.0 | MIT | microsoft1es | Not published |
| [tesseract.js](https://www.npmjs.com/package/tesseract.js/v/7.0.0) | 7.0.0 | Apache-2.0 | balearica | Not published |

### Desktop build and bundled UI

| Package / npm source | Exact version | Declared license | Publisher | Provenance |
| --- | --- | --- | --- | --- |
| [electron](https://www.npmjs.com/package/electron/v/44.7.0) | 44.7.0 | MIT | electron-nightly | Not published |
| [electron-vite](https://www.npmjs.com/package/electron-vite/v/5.0.0) | 5.0.0 | MIT | alex.wei | Not published |
| [vite](https://www.npmjs.com/package/vite/v/7.3.7) | 7.3.7 | MIT | GitHub Actions | Published; metadata matched |
| [@vitejs/plugin-react](https://www.npmjs.com/package/@vitejs/plugin-react/v/5.2.0) | 5.2.0 | MIT | GitHub Actions | Published; metadata matched |
| [electron-builder](https://www.npmjs.com/package/electron-builder/v/26.17.0) | 26.17.0 | MIT | GitHub Actions | Published; metadata matched |
| [@electron/fuses](https://www.npmjs.com/package/@electron/fuses/v/2.1.3) | 2.1.3 | MIT | GitHub Actions | Published; metadata matched |
| [react](https://www.npmjs.com/package/react/v/19.3.0) | 19.3.0 | MIT | GitHub Actions | Published; metadata matched |
| [react-dom](https://www.npmjs.com/package/react-dom/v/19.3.0) | 19.3.0 | MIT | GitHub Actions | Published; metadata matched |
| [react-aria-components](https://www.npmjs.com/package/react-aria-components/v/1.22.0) | 1.22.0 | Apache-2.0 | devongovett | Not published |
| [tailwindcss](https://www.npmjs.com/package/tailwindcss/v/4.3.3) | 4.3.3 | MIT | GitHub Actions | Published; metadata matched |
| [@tailwindcss/vite](https://www.npmjs.com/package/@tailwindcss/vite/v/4.3.3) | 4.3.3 | MIT | GitHub Actions | Published; metadata matched |
| [@fontsource-variable/vazirmatn](https://www.npmjs.com/package/@fontsource-variable/vazirmatn/v/5.3.0) | 5.3.0 | OFL-1.1 | lotusdevshack | Published; metadata matched |
| [zod](https://www.npmjs.com/package/zod/v/4.6.5) | 4.6.5 | MIT | GitHub Actions | Published; metadata matched |

### Root tooling

| Package / npm source | Exact version | Declared license | Publisher | Provenance |
| --- | --- | --- | --- | --- |
| [typescript](https://www.npmjs.com/package/typescript/v/6.0.3) | 6.0.3 | Apache-2.0 | typescript-bot | Not published |
| [@types/node](https://www.npmjs.com/package/@types/node/v/24.19.1) | 24.19.1 | MIT | types | Not published |
| [@types/react](https://www.npmjs.com/package/@types/react/v/19.3.0) | 19.3.0 | MIT | types | Not published |
| [@types/react-dom](https://www.npmjs.com/package/@types/react-dom/v/19.3.0) | 19.3.0 | MIT | types | Not published |
| [@types/better-sqlite3](https://www.npmjs.com/package/@types/better-sqlite3/v/9.6.0) | 9.6.0 | MIT | types | Not published |
| [vitest](https://www.npmjs.com/package/vitest/v/5.0.3) | 5.0.3 | MIT | GitHub Actions | Published; metadata matched |
| [@amiceli/vitest-cucumber](https://www.npmjs.com/package/@amiceli/vitest-cucumber/v/8.0.0) | 8.0.0 | ISC | amiceli | Not published |
| [@playwright/test](https://www.npmjs.com/package/@playwright/test/v/1.64.0) | 1.64.0 | Apache-2.0 | GitHub Actions | Published; metadata matched |
| [playwright-bdd](https://www.npmjs.com/package/playwright-bdd/v/9.2.1) | 9.2.1 | MIT | GitHub Actions | Published; metadata matched |
| [eslint](https://www.npmjs.com/package/eslint/v/10.12.0) | 10.12.0 | MIT | eslintbot | Not published |
| [typescript-eslint](https://www.npmjs.com/package/typescript-eslint/v/8.71.1) | 8.71.1 | MIT | GitHub Actions | Published; metadata matched |
| [dependency-cruiser](https://www.npmjs.com/package/dependency-cruiser/v/18.5.0) | 18.5.0 | MIT | GitHub Actions | Published; metadata matched |
| [spdx-expression-parse](https://www.npmjs.com/package/spdx-expression-parse/v/5.0.0) | 5.0.0 | MIT | kemitchell | Not published |
| [spdx-satisfies](https://www.npmjs.com/package/spdx-satisfies/v/6.0.0) | 6.0.0 | MIT | kemitchell | Not published |

## Legitimacy and provenance

Registry publishers and repository identities match the established projects in the approved research: WiseLibs, withcatai, Microsoft, naptha, Electron, React, Adobe, DefinitelyTyped and the named tooling maintainers. Full repository and publisher metadata is retained in the evidence below.

Seventeen direct pins publish SLSA provenance attestations. Their subject SHA-512 values and workflow repository URLs match the corresponding registry metadata. This verifies attestation contents against metadata; signatures and downloaded tarballs were not cryptographically verified. Fourteen packages publish no provenance in the observed metadata:

onnxruntime-node, tesseract.js, electron, electron-vite, react-aria-components, typescript, @types/node, @types/better-sqlite3, @amiceli/vitest-cucumber, eslint, spdx-expression-parse, spdx-satisfies, @types/react, @types/react-dom.

Missing provenance and the existing research's recent-release warnings remain human review considerations. Familiar publisher metadata does not eliminate compromise risk.

Evidence: [registry metadata](evidence/01-02-registry-metadata.json), [npm view results](evidence/01-02-npm-view.json), [attestations](evidence/01-02-provenance-attestations.json), [provenance comparisons](evidence/01-02-provenance-checks.json), [all locked package metadata](evidence/01-02-lockfile-package-metadata.json).

## Package manager and lockfile strategy

- Existing host Node is 24.21.0; existing pnpm is 12.9.1. Root declares `packageManager: pnpm@12.9.1` and Node `>=24.21.0 <25`.
- Only `apps/desktop` is a workspace member, with `nodeLinker: hoisted` as approved for Electron packaging.
- Actual resolution: `NODE_LLAMA_CPP_SKIP_DOWNLOAD=true ONNXRUNTIME_NODE_INSTALL=skip pnpm install --lockfile-only --ignore-scripts --registry=https://registry.npmjs.org/`. Exit 0. The extra `--ignore-scripts` is a safeguard; no full install ran.
- pnpm 12.9.1 generated two YAML documents, both lockfile version 9.0: 15 package-manager package records and 722 application/tooling records; 737 unique package/version records total. The extra pnpm/platform executable records are generated package-manager dependencies, not additions to either application manifest. Consumers must count both documents.
- Reviewed lockfile SHA-256: `3fca83b35d0995ceb52a9b3b1c10caf6c62aa0627737d9012674c84d9923e157`.
- After approval and resolution of license conflicts, install with `NODE_LLAMA_CPP_SKIP_DOWNLOAD=true ONNXRUNTIME_NODE_INSTALL=skip pnpm install --frozen-lockfile`. Verify byte identity; changed pins or lockfile require renewed review.
- There are zero `requiresBuild: true` entries and no license fields in the generated lockfile. That does not establish absence of scripts or license obligations. Registry metadata independently identifies the lifecycle scripts and licenses below. Any implicit build or unknown script-bearing package found during installation returns to this gate.

## Explicit lifecycle-script decisions

Only esbuild may run its install script. The additional false entries for fsevents and pnpm follow Task 1's instruction to block other script-bearing packages; pnpm belongs to the package-manager document. No additional true entry was added.

| Locked package | Declared lifecycle script | allowBuilds |
| --- | --- | --- |
| pnpm@12.9.1 | preinstall: node install.js; postinstall: node install.js | BLOCK |
| electron-winstaller@5.4.0 | install: node ./script/select-7z-arch.js | BLOCK |
| esbuild@0.25.12 | postinstall: node install.js | ALLOW |
| esbuild@0.28.2 | postinstall: node install.js | ALLOW |
| fsevents@2.3.3 | install: node-gyp rebuild | BLOCK |
| node-llama-cpp@3.22.1 | postinstall: node ./dist/cli/cli.js postinstall | BLOCK |
| onnxruntime-node@1.30.0 | postinstall: node ./script/install | BLOCK |
| tesseract.js@7.0.0 | postinstall: opencollective-postinstall || true | BLOCK |

Electron 44.7.0 declares no lifecycle scripts in this metadata. Its first invocation later downloads its binary; that expected download is included in the requested approval. Esbuild may obtain its matching platform binary during the approved install. No browser install, model/probe download or other lifecycle permission is included. All unexpected scripts remain blocked.

## License conflicts identified before approval

**Resolved by the user's narrow build-time exception:** `@tailwindcss/vite@4.3.3 → @tailwindcss/node@4.3.3 → lightningcss@1.32.0` introduces MPL-2.0. Vite also resolves lightningcss as an optional peer. Eleven platform packages also declare MPL-2.0, including Windows x64 and macOS arm64. Dropping optional dependencies cannot remove the required Tailwind build dependency. The exception does not authorize application distribution of these packages.

MPL-2.0 is file-level copyleft and falls outside the approved permissive-only policy. It does not automatically relicense Danesh's separate original files, but distributing covered code/binaries introduces source-access and notice obligations. See [Mozilla's MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) and [Lightning CSS's license](https://github.com/parcel-bundler/lightningcss/blob/master/LICENSE). These packages are build tooling in the approved layout; their exclusion from shipped production artifacts is not yet verified.

Three more packages fall outside Plan 01-05's original explicit allowed identifiers and initial reviewed exception: spdx-exceptions (CC-BY-3.0), spdx-ranges (MIT AND CC-BY-3.0), and truncate-utf8-bytes (WTFPL). The user has now approved named exceptions, with published-text confirmation required for truncate-utf8-bytes. CC-BY data attribution must be retained. The table below records the original pre-approval assessment; the explicit approval and license policy above govern continuation.

| Locked package | Declared license | Gate assessment |
| --- | --- | --- |
| argparse@2.0.1 | Python-2.0 | Allowed identifier or allowed OR branch under Plan 01-05 |
| caniuse-lite@1.0.30001815 | CC-BY-4.0 | Reviewed exception already specified in Plan 01-05 |
| chownr@3.0.0 | BlueOak-1.0.0 | Allowed identifier or allowed OR branch under Plan 01-05 |
| isexe@3.1.5 | BlueOak-1.0.0 | Allowed identifier or allowed OR branch under Plan 01-05 |
| isexe@4.0.0 | BlueOak-1.0.0 | Allowed identifier or allowed OR branch under Plan 01-05 |
| lightningcss-android-arm64@1.32.0 | MPL-2.0 | BLOCKED: outside D-02 |
| lightningcss-darwin-arm64@1.32.0 | MPL-2.0 | BLOCKED: outside D-02 |
| lightningcss-darwin-x64@1.32.0 | MPL-2.0 | BLOCKED: outside D-02 |
| lightningcss-freebsd-x64@1.32.0 | MPL-2.0 | BLOCKED: outside D-02 |
| lightningcss-linux-arm-gnueabihf@1.32.0 | MPL-2.0 | BLOCKED: outside D-02 |
| lightningcss-linux-arm64-gnu@1.32.0 | MPL-2.0 | BLOCKED: outside D-02 |
| lightningcss-linux-arm64-musl@1.32.0 | MPL-2.0 | BLOCKED: outside D-02 |
| lightningcss-linux-x64-gnu@1.32.0 | MPL-2.0 | BLOCKED: outside D-02 |
| lightningcss-linux-x64-musl@1.32.0 | MPL-2.0 | BLOCKED: outside D-02 |
| lightningcss-win32-arm64-msvc@1.32.0 | MPL-2.0 | BLOCKED: outside D-02 |
| lightningcss-win32-x64-msvc@1.32.0 | MPL-2.0 | BLOCKED: outside D-02 |
| lightningcss@1.32.0 | MPL-2.0 | BLOCKED: outside D-02 |
| minimatch@10.2.6 | BlueOak-1.0.0 | Allowed identifier or allowed OR branch under Plan 01-05 |
| minipass@7.1.3 | BlueOak-1.0.0 | Allowed identifier or allowed OR branch under Plan 01-05 |
| rc@1.2.8 | (BSD-2-Clause OR MIT OR Apache-2.0) | Allowed identifier or allowed OR branch under Plan 01-05 |
| sanitize-filename@1.6.4 | WTFPL OR ISC | Allowed identifier or allowed OR branch under Plan 01-05 |
| sax@1.6.1 | BlueOak-1.0.0 | Allowed identifier or allowed OR branch under Plan 01-05 |
| spdx-exceptions@2.5.0 | CC-BY-3.0 | Human exception/replacement required |
| spdx-license-ids@3.0.24 | CC0-1.0 | Allowed identifier or allowed OR branch under Plan 01-05 |
| spdx-ranges@2.1.1 | (MIT AND CC-BY-3.0) | Human exception/replacement required |
| tar@7.5.22 | BlueOak-1.0.0 | Allowed identifier or allowed OR branch under Plan 01-05 |
| truncate-utf8-bytes@1.0.2 | WTFPL | Human exception/replacement required |
| tslib@2.8.1 | 0BSD | Allowed identifier or allowed OR branch under Plan 01-05 |
| type-fest@0.13.1 | (MIT OR CC0-1.0) | Allowed identifier or allowed OR branch under Plan 01-05 |
| type-fest@0.20.2 | (MIT OR CC0-1.0) | Allowed identifier or allowed OR branch under Plan 01-05 |
| utf8-byte-length@1.0.5 | (WTFPL OR MIT) | Allowed identifier or allowed OR branch under Plan 01-05 |
| yallist@5.0.0 | BlueOak-1.0.0 | Allowed identifier or allowed OR branch under Plan 01-05 |

No GPL, AGPL, LGPL, unknown or non-commercial declaration was observed among the 737 metadata results. This does not prove embedded native code is license-clean. Plan 01-05's binary review and notices verification remain outstanding. Applicable Apache-2.0 NOTICE files and Vazirmatn's OFL-1.1 text must ship; Danesh's MIT grant covers its original source only.

## Compatibility and support limits

Observed peers accept Vite 7.3.7, React 19.3.0, Vitest 5.0.3, Playwright 1.64.0, ESLint 10.12.0 and TypeScript 6.0.3. The resolver reported no peer incompatibility. Keep TypeScript below 6.1.0 for typescript-eslint 8.71.1 and Vite on 7 for electron-vite 5. Host Node 24.21.0 satisfies the observed direct engine ranges.

Electron's actual bundled Node version, TypeScript executable, SQLite prebuild presence and frozen installation are unverified before approval. Planned expected values remain Electron 44.7.0 / Node 24.21.0 / TypeScript 6.0.3. SQLite type-definition compatibility, native isolation and packaged Windows/macOS support need later verification.

Four transitive packages are deprecated: boolean 3.2.0 (unsupported), glob 7.2.3 (upstream warns of vulnerabilities), inflight 1.0.6 (unsupported, memory leak), rimraf 2.6.3 (unsupported). Dependency paths include @electron/asar → glob → inflight, temp → rimraf → glob, and global-agent/roarr → boolean. These are upstream tooling dependencies; no override was introduced and no security audit result is claimed.

## License files and actual verification

LICENSE and accepted product-decision ADR 0004 are prepared independently before installation because their content needs no installed toolchain and MIT was already decided. Task 4's required commit remains outstanding; no other ADR was modified. The SPDX source is fixed at v3.27.0 with its fetched SHA-256 recorded in ADR 0004. LICENSE changes only the copyright placeholder.

- Task 1 exact verification: exit 0; `PINS-OK 31`, `LOCKFILE-ONLY-OK`.
- Task 4 exact verification of prepared files: exit 0; `LICENSE-ADR-OK`.
- Task 3 install verification: NOT run; blocked by approval.
- Application build, feature execution, native engines and platform packaging: NOT run.

See [resolution transcript](evidence/01-02-lockfile-resolution.txt) and [pre-install transcript](evidence/01-02-pre-install-validation.txt). Plan 01-02 has no canonical completion summary and is not complete. No Plan 01-03 or later implementation ran.

## Original checkpoint decisions (now explicitly answered by the user)

1. Resolve the license conflict: keep D-02 and specify replacements, or explicitly authorize a narrow build-tool exception for lightningcss 1.32.0 and its platform packages. An exception requires a recorded policy decision, notice/source conditions and later proof of exclusion from shipped production artifacts; generic install approval does not imply that exception.
2. Approve named reviewed exceptions or replacements for spdx-exceptions 2.5.0, spdx-ranges 2.1.1 and truncate-utf8-bytes 1.0.2.
3. Approve these exact direct pins, reviewed lockfile and lifecycle policy, considering missing provenance and deprecated tooling. This authorizes package tarballs, esbuild lifecycle scripts and the expected Electron 44.7.0 binary download for the bundled-Node query. It excludes other lifecycle scripts, browsers, models, probes, pushes and publication.
4. Separately authorize the required Plan 01-02 local task commits; the current grant covers Plan 01-01 only.

The user's reply authorizes installation and the required local task commits. The truncate-utf8-bytes published-license confirmation remains unverified after installation. Automatic chaining remains disabled; execution stops within Plan 01-02.

## Actual post-approval results

- Frozen installation succeeded; all 31 installed direct versions match the reviewed pins. pnpm added 635 packages on Windows. The 737-record reviewed lockfile is byte-identical, with SHA-256 `3fca83b35d0995ceb52a9b3b1c10caf6c62aa0627737d9012674c84d9923e157`.
- Only the two esbuild postinstall scripts ran. All other identified lifecycle scripts remain explicitly false; pnpm reports no pending builds. The official Electron binary was obtained by its approved first-run download using the package's checksum data. No native compilation, extra engine download, model/probe fetch or browser installation ran.
- The first exact Task 3 command exited 1 because Electron's first-run download banner was included in the captured version string. The unchanged command was rerun with the binary cached and exited 0: `electron-node=24.21.0`, `INSTALL-OK`.
- Electron is 44.7.0, its bundled Node is 24.21.0 (ABI 149), host Node is 24.21.0 (ABI 137), TypeScript is 6.0.3 and pnpm is 12.9.1. SQLite's Windows x64 prebuild exists, and SQLite plus ONNX native loading passed in both host Node and Electron-as-Node. The LLM CPU prebuilt binding loaded with `build: never` and `skipDownload: true`; OCR package import passed without starting a worker or requesting language data.
- A temporary strict TypeScript probe with `skipLibCheck: false` found two upstream declaration errors in node-llama-cpp 3.22.1: `getLlamaForOptions` destructures an undeclared `tempDir` property, and `readGgufFileInfo.d.ts` imports async-retry without declarations. An isolation probe excluding only node-llama-cpp passed with zero diagnostics for SQLite, Electron, ONNX, React and Zod types. No package patch, new type dependency or compiler configuration was introduced to conceal the failures. Project-wide typecheck is not run because its source/configuration belongs to later plans.
- Task 4's exact command exited 0: `LICENSE-ADR-OK`.
- Production graph inspection found 163 distinct reachable package/version entries and none of the named exception packages. Actual Danesh packaged artifacts do not exist, so archive/resource exclusion remains unverified until the authorized packaging plan. No later plan was executed to manufacture packaging evidence.
- Fifty-six published license/notice/attribution files were retained verbatim, plus the fixed-tag SPDX CC-BY-3.0 text, with hashes and sources in `third_party/PLAN-01-02-LICENSE-EVIDENCE.json`. This is retained evidence, not Plan 01-05's complete release notice inventory.
- truncate-utf8-bytes 1.0.2 contains no LICENSE/COPYING/NOTICE text; its immutable upstream source revision also contains none. The published WTFPL declaration, README and AUTHORS are preserved. A generic license text has not been substituted as package evidence. Its conditional exception is not fully verified.

Evidence: [installation commands and outcomes](evidence/01-02-install-verification.txt), [native module checks](evidence/01-02-native-verification.txt), [toolchain versions](evidence/01-02-toolchain-versions.txt), [strict TypeScript diagnostics](evidence/01-02-typescript-verification.txt), [production graph result](evidence/01-02-production-dependency-check.json), [truncate publisher/source evidence](evidence/01-02-truncate-license-provenance.json).

Plan 01-02 remains incomplete. A noncanonical draft execution summary will record this stop; GSD completion counts must not advance until the conditional license issue and TypeScript compatibility disposition are resolved explicitly. The permissive-only default and all non-commercial/GPL/AGPL/LGPL exclusions remain intact.

## Blocker resolution follow-up

Official maintainer-merged commit 4212839ea184e74fb81f1e4e633e1db794ebe4f4 is the immediate child of the v1.0.2 npm gitHead. It adds both license texts and updates only package metadata, retaining version 1.0.2. All three installed runtime source files match that licensed revision. Both official license texts are retained with hashes; select MIT for the identical component without altering package metadata, dependency graph or global policy. The earlier text-absence finding is historical and is superseded by this verifiable upstream grant.

The TypeScript root causes are published declaration defects: an omitted tempDir member and an upstream dev-only async-retry type dependency. The existing approved Plan 01-03 skipLibCheck setting permits the reviewed declarations while preserving strict Danesh source checking. The setting and its declaration-only trade-off were explained before use and documented in docs/typescript-compatibility.md. A valid source probe passes; an invalid numeric gpu option still fails TS2322. No new dependency, version change, vendor patch or source suppression was used.

Evidence: evidence/01-02-license-history-followup.json, evidence/01-02-license-history-detail.json, evidence/01-02-license-applicability-check.json and evidence/01-02-type-compatibility-followup.json. Actual packaging inspection remains outstanding until the authorized packaging plan.
