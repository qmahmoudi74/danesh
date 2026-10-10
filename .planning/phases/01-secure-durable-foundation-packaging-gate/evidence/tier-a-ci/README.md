# Tier A CI evidence

After a GitHub Actions run of `.github/workflows/ci.yml`, download the `evidence-windows-latest` and
`evidence-macos-latest` artifacts and place them under `<run-id>/<os>/` in this folder, together with the run URL in
`<run-id>/RUN.md`.

Hosted runners are Windows Server 2025 and macOS 26 images, not the target consumer machines. CI results are Tier A
and count as **partially verified** only. Windows 11 and macOS 13+ consumer verification comes from the Tier B
runbooks in `docs/verification/`.

Until a green run on both operating systems is linked here, REL-01 is reported as partially verified. The workflow
has run on GitHub; platform failures and their evidence remain recorded.

- [38015174157](38015174157/RUN.md): both jobs failed; authenticated artifacts and diagnostic observations retained.
- [38016154277](38016154277/RUN.md): Windows passed, fresh artifact downloaded and validated; macOS smoke failed.
  The owner approved Windows-first development while macOS investigation remains deferred. Acceptance criteria
  and separate Tier B requirements are unchanged.
