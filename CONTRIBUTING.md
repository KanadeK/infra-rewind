# Contributing

Thank you for improving Infra Rewind. Contributions should preserve three boundaries: deterministic
offline behavior, evidence traceability, and explicit separation between facts and hypotheses.

## Local workflow

1. Use Node.js 22.13 or newer.
2. Run `npm ci`.
3. Create a focused branch.
4. Add regression coverage for behavioral changes.
5. Run `npm run lint`, `npm run typecheck`, `npm run test:coverage`, and `npm run build`.
6. Describe user impact and verification in the pull request.

Fixtures must be synthetic or redistributable under a documented license. Do not submit production
infrastructure exports, credentials, personal data, or unredacted operational logs.
