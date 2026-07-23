# Release Checklist

- [ ] Version agrees across package metadata, UI, and changelog.
- [ ] Lint, formatting, typecheck, coverage, E2E, and production build pass.
- [ ] All three synthetic incidents produce deterministic reports.
- [ ] Core coverage is at least 80%; critical domain modules target at least 90%.
- [ ] Release package is built and smoke-tested from a clean temporary directory.
- [ ] Secret and unfinished-marker scans are clean.
- [ ] Author, committer, shortlog, and contributor identities are verified.
- [ ] CI, security, and Pages workflows are green.
- [ ] Release assets and `SHA256SUMS.txt` agree.
