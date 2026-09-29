# Changelog

All notable changes to aiquadtreejs are summarized here.

## [0.6.0] - 2026-09-29

### Breaking

- `retrieveInto()`: a `target` that is not an array now throws `QuadtreeError` (`aiquadtreejs: retrieveInto target must be an array`) before the tree is walked, instead of a bare `TypeError` from `target.length = 0` / `target.push` or, for a non-array object when nothing matched, silently returning that object. Migration: pass an array (an `Array` subclass is fine) as `target`, and catch `QuadtreeError` where you caught `TypeError`.

### Changes

- Changed: `createQuadtree()` with a missing or non-object options argument throws `QuadtreeError` (`aiquadtreejs: options must be an object with bounds`), and with a missing or non-object `bounds` throws `QuadtreeError` (`aiquadtreejs: bounds must be an object with finite numeric x, y, width and height`), instead of a bare `TypeError` from destructuring.
- Changed: every `QuadtreeError` message now starts with `aiquadtreejs: `; the `createQuadtree()` and `insert()` messages gained the prefix the `retrieve()` messages already had (e.g. `aiquadtreejs: maxObjects must be a positive integer`). Match on the class plus a regex, not the exact text.
- Fixed: `createQuadtree` read `bounds.x/y/width/height` into locals instead of storing `{ ...bounds }`, so accessor-backed bounds (e.g. PixiJS v8 `Bounds`, returned by `getBounds()`) are no longer dropped — previously every insert was silently lost and `retrieve()` always returned `[]`.
- Fixed: `retrieve()`/`retrieveInto()` now match zero-extent regions that land exactly on a node's minimum edge (the root's `x`/`y` or any subdivision midline), instead of missing them depending on whether unrelated inserts had already subdivided the tree.
- Fixed: subdivision now stops once a node's midpoint is no longer representable in floating point, instead of continuing until `maxLevels`; previously a dense point cluster near that depth would silently stop matching `retrieve()` region queries.
- Fixed: `subdivide()` built right/bottom children as `x + w` with extent `w`, so their outer edge was `(x + w) + w`; with fractional bounds such as `x: -0.3, width: 2.4` that is one ulp short of the parent's `x + width`, and an object in that sliver was missed by `retrieve()`. Nodes now store min/max edges, and each child takes its parent's exact edges and midpoint.
- Fixed: `retrieve()`/`retrieveInto()` read each region field once and walk with the validated values; a region getter used to be read twice, so a value that changed between the reads passed validation and then silently matched nothing.
- Fixed: `package.json#exports` nests `types` under each of `import`/`require` (with `./dist/index.d.cts` for `require`), fixing TS1479 for CommonJS consumers under `module: node16`/`nodenext`; `verify-exports.mjs` walks nested condition objects.
- Docs: STABILITY.md's Behavioral Contract now states the construction validation order, shared node edges, retrieval completeness (pinned by new brute-force oracle properties over float bounds with negative origins), read-once regions, the `retrieveInto()` target check, the `aiquadtreejs: ` message shape and the re-entrancy clause (no events, callbacks or mailbox; getters only).
- Docs: README/README_ZHTW list the misuse errors and the completeness guarantee, and warn that inserted objects are re-read when their node subdivides; JSDoc for `QuadtreeError`, `createQuadtree()`, `QuadtreeOptions.bounds`, `insert()`, `retrieve()` and `retrieveInto()` matches the 0.6.0 contract.

## [0.5.9] - 2026-06-29

- Docs: corrected the zero-size root boundary description — a point on the root min boundary is inclusive and the max boundary is exclusive (right-open `[x, x+width)`), shipped in 0.5.8; removed the stale "known bug" wording and version tokens in source comments.

## [0.5.8] - 2026-06-14

- Fixed: a zero-size point on the root left/top minimum boundary (`{ x: bounds.x, y: bounds.y, width: 0, height: 0 }`) is now inserted and retrievable. The root insert gate's right-open overlap test dropped it; a new `rootContains` check is inclusive on the minimum edge and exclusive on the maximum edge, preserving right-open `[x, x+width)` semantics. Boundary regression tests added.
- Documentation-only slimming pass across README, stability notes, review backlog, and LLM context.

## [0.5.6] - 2026-06-10

- Hardened retrieve validation, scratch cleanup, and size-budget docs.
- Kept root quadtree API stable and regenerated generated LLM context.

## Older releases

- `0.5.5` through `0.5.1` focused on release hygiene, docs accuracy, and validation/retrieve regressions.
- `0.4.0` declared the stable ai*js quadtree surface.
- `0.3.x` added `retrieveInto()` and zero-allocation query paths.
- `0.1.x` introduced `createQuadtree`, `AABB`, `Quadtree`, and error classes.
