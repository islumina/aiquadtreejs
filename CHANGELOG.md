# Changelog

All notable changes to aiquadtreejs are summarized here.

## [Unreleased]

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
