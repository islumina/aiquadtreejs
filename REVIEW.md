# aiquadtreejs Review

Current review state after the 2026-09-29 ai*js 0.6.0 pass. Fixed findings are summarised; the backlog keeps only documented boundaries and deferred items.

## Current Known Issues / Backlog

| Priority | Area | Status | Notes |
| --- | --- | --- | --- |
| P3 | Unbounded `maxLevels` (node-count blowup) | Documented | High depths plus spanning objects can explode node counts. Current behavior leaves the cap to callers. |

## Fixed Summary

- Shared node edges (0.6.0, P3 backlog): nodes store `x0, y0, x1, y1`; the root's `x1 = x + width` is computed once and each child takes its parent's exact edges and the midpoint `x0 + (x1 - x0) / 2`, which `subdivide`, `quadrantIndices` and `isSplitRepresentable` share. Right/bottom children no longer end an ulp short of the parent (e.g. `x: -0.3, width: 2.4` used to end at 2.0999999999999996 instead of 2.1), so an object in that sliver is retrievable again. Pinned by O1-O3 and A14.
- Construction guard and message prefix (0.6.0, P3 backlog): `createQuadtree()` throws `QuadtreeError` for a missing or non-object options argument or `bounds` instead of a bare `TypeError`, and every `QuadtreeError` message starts with `aiquadtreejs: `. Tests match the class plus an anchored regex (A3-A8, A11-A13, J, L). Not breaking by the 0.6.0 decision; listed under Changed.
- Broadphase-completeness oracle (0.6.0, P3 backlog): `prop5` (`retrieve`) and `prop6` (`retrieveInto`) build trees over float bounds with negative origins (`maxObjects` 1-8, `maxLevels` 1-12, up to 200 objects including points, partly or fully outside objects, and one-ulp slivers on the exclusive edge) and assert that every object sharing a point with the region inside the root is returned. The oracle clips to the root because objects are indexed only by their part inside it. Against the pre-0.6.0 source it fails on 49 of 50 seeds; the fixed source passed 60,000 runs (600 seeds). Deterministic additions: A14 (getter-backed bounds), O1 (the negative-origin edge case), I16 (1,000 `retrieveInto` calls on one buffer).
- Read-once regions (0.6.0): `retrieve()`/`retrieveInto()` validate the region fields they walk with. The region used to be read by `validateRegion()` and again by the walk, so a getter that changed between reads passed validation and silently matched nothing (L14, L15).
- `retrieveInto()` target check (0.6.0, breaking): a non-array `target` throws `QuadtreeError` before it is touched, instead of a bare `TypeError` (or silently returning a non-array object when nothing matched) (I15).
- Package exports (0.6.0): `package.json#exports` nests `types` under each of `import`/`require` (with `./dist/index.d.cts` for `require`), fixing TS1479 for CommonJS consumers under `module: node16`; `verify-exports.mjs` walks nested condition objects.
- Zero-size root boundary (fixed 0.5.8): `rootContains` now uses inclusive-minimum / exclusive-maximum (`[x, x+width)`) semantics for zero-size points, so a point exactly on the root `left/top` boundary is correctly accepted.
- `retrieve()` and `retrieveInto()` validate regions before traversal.
- `clear()` drains internal scratch buffers.
- Spanning object results are deduplicated.
- Accessor-backed `bounds` (e.g. PixiJS v8 `Bounds`) are read into locals once instead of spread into a plain object, so a class instance with prototype getters no longer silently drops every insert.
- Zero-extent `retrieve()`/`retrieveInto()` regions landing exactly on a node's minimum edge (root or subdivision midline) now match, instead of depending on whether unrelated inserts happened to subdivide the tree first.
- Subdivision now stops once a node's midpoint is no longer representable in floating point, so a dense point cluster at very high `maxLevels` no longer silently vanishes from `retrieve()`.
- `retrieveInto()`'s JSDoc no longer claims literal zero per-call heap allocation; corrected to describe the small, short-lived allocation that remains on V8.
- README_ZHTW.md no longer describes the (already-fixed, 0.5.8) zero-size root-boundary issue as a current known bug.
- `QuadtreeError`'s docstring now lists `retrieve()`/`retrieveInto()` region validation as a throw site alongside `createQuadtree`/`insert()`.
- STABILITY.md's Stable Surface table now lists the `disposed` getter.

## Closed Without Change

- Re-entrancy mailbox: the family FIFO-mailbox rule covers state-owning dispatchers (aifsmjs, aispritejs). The tree dispatches no events and runs no callbacks; the only user code it runs is property getters, and STABILITY.md states that clause.
- Extents below half an ulp: a positive `width` whose sum is absorbed (`x + width === x` in floating point, e.g. `x: 1e17, width: 1`) is an empty right-open span, so such an object is not indexed and such root bounds index nothing. This follows the documented float semantics and needs coordinates about 1e16 times larger than the extent; treating it as a point would change the zero-extent rule for every caller.
- Moving an inserted object before `clear()`: objects are stored by reference and re-read when their node subdivides, so a moved object is routed by its new coordinates. Cloning would break the reference-returning contract and add per-insert allocation; README and STABILITY.md now say to rebuild instead.

## Verification Baseline

- `pnpm typecheck`
- `pnpm test`
- `pnpm verify:docs`
- `pnpm verify:exports`
- `pnpm verify:llms`
- `pnpm check:size`
- `pnpm prepublishOnly` (all of the above plus lint, coverage thresholds and build)
