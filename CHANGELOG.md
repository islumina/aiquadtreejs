# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-05-28

### Changed (CI)

- **`publish.yml` now triggers on `push: tags: ["v*"]`** (was `workflow_dispatch` only). Aligns with the trigger used by `aifsmjs` / `aiecsjs` / `aibridgejs`. Tag push now automatically runs the OIDC trusted publish.
- **`npm publish --provenance --access public`** — the workflow now emits a [sigstore provenance attestation](https://docs.npmjs.com/generating-provenance-statements) so consumers can verify the tarball was built by this workflow on this commit.

No runtime / source / API changes from 0.1.0. **0.1.1 is also the first version to actually land on npm — 0.1.0 was tagged in git but never published to npm.** Production bundles are byte-identical to the 0.1.0 git tag.

## [0.1.0] - 2026-05-28

### Added

- `createQuadtree({ bounds, maxObjects, maxLevels })` factory — 2D AABB broadphase.
- `insert(obj)` / `retrieve(region)` / `clear()` / `dispose()` lifecycle.
- Set-based dedup on `retrieve()` so objects spanning multiple quadrants are returned once.
- Per-frame rebuild model — `clear()` reuses internal node objects (zero GC churn frame-to-frame).
- `disposed` read-only flag; post-dispose calls throw `QuadtreeDisposedError`.
- Test coverage ≥95% statements / lines / functions / ≥90% branches (~30 it() blocks, groups A–H).
- Size budget: ≤2 KB gzip.
- Dual ESM + CJS build via `tsup` with `minify: true`; `sideEffects: false`; zero runtime dependencies.

## [0.0.1] - 2026-05-28

### Added (scaffold)

- Full package scaffold landed (`package.json`, `tsconfig.json`,
  `tsconfig.test.json`, `tsup.config.ts`, `vitest.config.ts`, `biome.json`,
  `scripts/{verify-exports,check-size,build-llms-full}.mjs`,
  `test/scaffold.test.ts`, `examples/.gitkeep`, `.github/workflows/{ci,publish}.yml`,
  `llms.txt`, `llms-full.txt`).
- `src/index.ts` remains a `throw` stub exposing the frozen 0.1.0 API surface
  (`createQuadtree`, `Quadtree<T>`, `QuadtreeOptions`, `AABB`,
  `QuadtreeError`, `QuadtreeDisposedError`).
- `pnpm typecheck && pnpm lint && pnpm coverage && pnpm build &&
  pnpm verify:exports && pnpm verify:llms && pnpm check:size` walks clean
  against a single placeholder test.
- Coverage thresholds temporarily set to `0/0/0/0`; tightened to
  `95/90/100/100` in 0.1.0 with real tests.
- Size budget temporarily set to 3 KB gzip; tightened to the 2 KB README
  target in 0.1.0.
- Publish workflow exists but trigger is `workflow_dispatch` only — no
  accidental npm release on tag push until 0.1.0.

