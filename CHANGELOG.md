# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **`insert()` input validation** — `insert()` now throws `QuadtreeError`
  when the inserted object contains a non-finite coordinate (`NaN`,
  `Infinity`, `-Infinity` in any of `x`, `y`, `width`, `height`) or a
  negative dimension (`width < 0` or `height < 0`). Previously, such
  objects were silently mishandled (kept before subdivide, silently dropped
  after). Zero-extent objects (points / lines with `width=0` and/or
  `height=0`) remain valid and are not rejected. The `QuadtreeError`
  JSDoc already noted this use was reserved; the behaviour is now
  implemented and documented in `STABILITY.md`.

### Tests

- Added J-group (J1–J15): `insert()` throws `QuadtreeError` for
  `width<0`, `height<0`, `NaN`/`Infinity` in any of `x/y/width/height`, and
  for `null`/`undefined` objects (J14/J15); valid zero-extent objects
  (width=0, height=0, mixed) are accepted.
- Added K-group (K1–K7): oversized object appears exactly once in
  full-region and per-quadrant sub-queries after subdivide; `retrieveInto`
  buffer identity preserved across 60 clear+insert+retrieveInto frames;
  negative-origin bounds with negative-coord objects and queries; zero-
  extent point at a non-midpoint survives deep subdivision (maxLevels=4)
  and is retrievable with a tight region; maxLevels=1 with many same-
  quadrant objects — all retrievable, zero duplicates; non-origin bounds
  insert+retrieve correctness.

## [0.4.0] - 2026-05-29

Dependency hygiene + stability freeze. **No runtime API addition or behaviour
change** — `dist/index.js` is byte-identical to 0.3.1; consumers see no
difference. This release unifies the ai*js family version line at 0.4.0 and
formally freezes the public surface for the 1.x track.

### Changed

- **devDependencies** — removed unused `tsx` (no script, config, or example in
  this package invoked it) and aligned `fast-check` `^3.23.0` → `^4.8.0` to
  match the rest of the ai*js family. Both are dev-only and absent from the
  published tarball (`files` ships `dist` + docs only), so consumers are
  unaffected.

### Stability

- The 0.3.x public surface — `createQuadtree`, the `Quadtree<T>` interface and
  all its members (`insert` / `retrieve` / `retrieveInto` / `clear` /
  `dispose` / `disposed`), `AABB`, `QuadtreeOptions`, `QuadtreeError`,
  `QuadtreeDisposedError` — is declared **frozen for the 1.x track**: it will
  not break before a 1.0.0+ major. The 3D octree variant remains a draft
  (target v0.6+).

### Internal (not shipped to npm)

- `pnpm audit` reports no known vulnerabilities; `pnpm-lock.yaml` regenerated
  after the devDependency changes. Property tests re-run green under
  fast-check v4.

## [0.3.1] - 2026-05-29

### Changed

- **`retrieveInto` is now genuinely zero-allocation in steady state.** The
  internal dedup `Set` and DFS stack are hoisted to the tree instance and
  reused across calls (cleared, not re-created) instead of being allocated
  per query. Combined with the caller-owned `target` buffer, a per-frame
  broadphase loop issuing thousands of `retrieveInto` queries now allocates
  nothing once result sizes stabilise — the design goal stated in 0.3.0.
  Purely internal: no API, signature, or observable-behaviour change.
  `retrieve` still returns a fresh array each call.
- **`dispose()`** now also clears the internal scratch, preserving the
  "drops references so the GC can reclaim everything" guarantee.
- **Docs** — `AABB` JSDoc leads with a renderer-neutral right-open
  definition (PixiJS `getBounds()` demoted to a compatibility note);
  `dispose()` JSDoc now lists `retrieveInto` among the post-dispose
  throwers; the 0.3.0 changelog note reworded ("observationally identical"
  rather than "byte-for-byte"); `STABILITY.md` exports list now includes
  the `Quadtree<T>` interface.

### Internal (not shipped to npm)

- Property test `prop2` uses `fc.uniqueArray` keyed on `id` instead of an
  early-return guard that skipped ~39% of runs on id collisions; the
  id-uniqueness invariant now runs on every case. Property generators mix
  in zero-extent midpoint points (`fc.oneof`) so the dedup invariants
  exercise the G4 regression shape, not just deterministic fixtures.
- Tightened `I4` (`toBe(1)`); added `I13` (retrieve fresh-array vs
  retrieveInto buffer-reuse contrast — backward-compat lock) and `I14`
  (interleaved retrieve / retrieveInto correctness — shared-scratch guard).

### Notes

- `dist/index.js` runtime differs from 0.3.0 only by the scratch-hoist
  optimisation; the public API and all observable behaviour are unchanged.

## [0.3.0] - 2026-05-29

### Added

- **`retrieveInto(region: AABB, target: T[]): T[]`** — zero-allocation
  variant of `retrieve` for hot-path callers. Clears `target`, walks
  the same iterative DFS + Set dedup as `retrieve`, writes results
  into `target`, returns `target`. The returned reference equals the
  argument — callers can hold a permanent buffer and pass it every
  frame to eliminate the result-array allocation churn (5,000+ calls
  per frame in typical bullet-hell broadphase loops).
- **`STABILITY.md`** — explicit stable vs experimental API tracking.
  Includes a v0.6+ 3D octree draft (no source code in this release).
- **Property-based tests** via `fast-check` — 4 invariants covering
  `retrieve` dedup and `retrieveInto` identity / length / content
  equivalence. Adds `fast-check` to `devDependencies`.

### Changed

- **`Quadtree.clear` JSDoc** — corrected the claim that "internal
  node objects are reused across frames"; only the root node is
  reused, child nodes are released on `clear()` and re-created when
  subdivision next triggers. No runtime behaviour change.
- **README Roadmap / Status / API sketch** — synced to v0.3.0,
  including the `retrieveInto(region, target)` signature (the
  pre-0.2 Roadmap entry was a single-argument draft).

### Notes

- `retrieve` behaviour is observationally identical to 0.1.1: the
  internal refactor extracts a shared `retrieveSet` helper that both
  `retrieve` and `retrieveInto` call, but `Set` insertion order →
  `Array.from` order is preserved by spec.
- Bundle size: ≤ 2 KB gzip budget still ~50% headroom after this
  release (expected ~1050-1090 B gzip).

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

