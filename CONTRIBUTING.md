# Contributing to aiquadtreejs

Thanks for taking the time to look. aiquadtreejs is a deliberately small
library (target ≤ 2 KB gzip); contributions that keep the surface narrow
are easier to accept than ones that expand it.

## Quick start

```bash
pnpm install
pnpm test            # vitest
pnpm coverage        # vitest with v0.1.0 thresholds (95/90/100/100)
pnpm typecheck       # tsc --noEmit on strict mode
pnpm lint            # biome check
pnpm build           # tsup; dual ESM/CJS + .d.ts
pnpm verify:exports  # ensures package.json#exports matches dist/
pnpm verify:llms     # ensures llms-full.txt is in sync with README + CHANGELOG
pnpm check:size      # gzip per subpath against the size budget
```

The full pre-publish gate is `pnpm prepublishOnly`, which runs typecheck,
lint, coverage (with thresholds), build, exports verification, llms drift
check, and size budget check — in that order.

## What gets in easily

- Bug fixes with a failing test added first
- README / typing corrections
- Tests that lock down existing behaviour (especially the Set-dedup
  invariant on `retrieve`)
- Performance work that keeps per-frame `clear()` + bulk `insert()` zero-GC

## What needs discussion first

- Anything that changes the public surface (`createQuadtree`, `Quadtree<T>`,
  `AABB`, `QuadtreeOptions`, error classes)
- Move-tracking / dynamic update (explicit non-goal — `clear()` + re-insert
  is faster in practice for ≤ 10k entities)
- Circle / Line / Polygon shape primitives (out of 2D AABB broadphase
  scope; bring your own user-land wrapper)
- 3D octree / R-tree / KD-tree (different size class; out of scope)
- Anything that pushes the core gzip past 2 KB

## Design principles

aiquadtreejs follows the ai*js library-core priority order:

> Security > Correctness > Simplicity > YAGNI > Performance

Key invariants:

- `retrieve()` deduplicates with a `Set` so each candidate appears once
  regardless of how many quadrants it spans.
- `clear()` reuses internal node objects across frames; no per-frame node
  allocation.
- `x + width` and `y + height` are **right-open** (exclusive), matching
  PixiJS `getBounds()` semantics.
- `dispose()` is idempotent.

## Commit & PR style

- Commit messages: imperative subject under 70 chars; body explains *why*.
- PRs: keep scope to one topic. Link the issue if any.
- Tests required for any behaviour change. Property-based tests welcome
  for invariants (especially the Set-dedup property).

## Reporting issues

- Minimal reproduction welcome (paste the smallest insert / retrieve
  sequence that shows the bug).
- For security issues, please email the maintainer rather than filing
  publicly.

## License

By contributing, you agree your changes will be licensed under the MIT
license that covers this project.
