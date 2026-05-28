# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Planned for 0.1.0

- `createQuadtree({ bounds, maxObjects, maxLevels })` factory — 2D AABB broadphase.
- `insert(obj)` / `retrieve(region)` / `clear()` / `dispose()` lifecycle.
- Set-based dedup on `retrieve()` so objects spanning multiple quadrants are returned once.
- Per-frame rebuild model — `clear()` reuses internal node objects (zero GC churn frame-to-frame).
- `disposed` read-only flag; post-dispose calls throw `QuadtreeDisposedError`.
- Test coverage ≥95% statements / lines / functions / ≥90% branches.
- Size budget: ≤2 KB gzip.
- Dual ESM + CJS build via `tsup`; `sideEffects: false`; zero runtime dependencies.
