# aiquadtreejs Review

Current review state after the 2026-09-28 ai*js pass.

## Current Known Issues / Backlog

| Priority | Area | Status | Notes |
| --- | --- | --- | --- |
| P3 | Unbounded `maxLevels` (node-count blowup) | Documented | High depths plus spanning objects can explode node counts. Current behavior leaves the cap to callers. |
| P3 | `subdivide()` right/bottom children drift by an ulp | Open | Right/bottom children are built as `x + w` with extent `w`, so their outer edge is `(x+w)+w` instead of the parent's exact `x+width`; with non-dyadic bounds this can be off by an ulp, and an object routed into that sliver fails `retrieve()`. Fix: store node extents as shared min/max edges (`x0,y0,x1,y1`) so children take the parent's exact edge instead of recomputing it; touches `subdivide`, `nodeOverlaps` and `retrieveSet`, so deferred past a local patch. |
| P3 | `createQuadtree` throws raw `TypeError` for missing/invalid `opts` | Open | `const { bounds } = opts` and the following `bounds.x` reads are unguarded, so `createQuadtree(undefined)`, `createQuadtree({})` and `createQuadtree({bounds:null})` throw `TypeError` instead of `QuadtreeError`, unlike `insert(null)`/`retrieve(null)`. Fix: guard `opts`/`opts.bounds` before reading fields and throw `QuadtreeError`. Flagged as an API-surface change (the thrown error type is part of the documented contract), so deferred rather than folded into this pass's local doc/guard fixes. |
| P3 | Property suite has no broadphase-completeness oracle | Open | `test/quadtree.prop.test.ts` only uses integer coordinates on a fixed origin-anchored root and never checks results against a brute-force oracle, so it would not have caught the ulp-drift or precision-bound-depth bugs above. Fix: add a fast-check property with random float bounds (non-integer, negative origin) and a brute-force oracle, plus deterministic tests for getter-based bounds and a `retrieveInto` allocation/GC regression. Sizeable new test surface, deferred past a small local fix. |

## Fixed Summary

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

## Verification Baseline

- `pnpm typecheck`
- `pnpm test`
- `pnpm verify:docs`
- `pnpm verify:exports`
- `pnpm verify:llms`
- `pnpm check:size`
