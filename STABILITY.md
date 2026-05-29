# aiquadtreejs Stability

This document tracks which public API is **stable** (subject to
semver-major break only) vs **experimental** (subject to change without
notice). Consumers should treat anything outside the Stable section as
unfit for production reliance.

---

## Stable

The following are stable as of v0.3.0 and will not break without a
major version bump (v1.0.0+).

### Exports

- `createQuadtree<T extends AABB>(opts: QuadtreeOptions): Quadtree<T>`
- `Quadtree<T extends AABB>` — the tree interface (`insert` / `retrieve` / `retrieveInto` / `clear` / `dispose` / `disposed`)
- `AABB` — `{ x, y, width, height }`, right-open semantics
- `QuadtreeOptions` — `{ bounds, maxObjects?, maxLevels? }`
- `QuadtreeError` — thrown by validation failures in `createQuadtree`
- `QuadtreeDisposedError` — thrown by any method on a disposed tree

### `Quadtree<T>` interface

| Member | Stability | Since |
|---|---|---|
| `insert(obj)` | Stable | 0.1.0 |
| `retrieve(region)` | Stable | 0.1.0 |
| `retrieveInto(region, target)` | Stable | 0.3.0 |
| `clear()` | Stable | 0.1.0 |
| `dispose()` | Stable | 0.1.0 |
| `disposed` (readonly) | Stable | 0.1.0 |

### Behaviour guarantees

- Dedup: `retrieve` / `retrieveInto` return each candidate exactly once
  even if it spans multiple quadrants.
- Right-open AABB: `x + width` and `y + height` are exclusive (matches
  PixiJS `getBounds()`).
- `dispose()` is idempotent; subsequent public-method calls throw
  `QuadtreeDisposedError`.
- All methods destructure cleanly: `const { insert } = qt; insert(obj)`
  works without `this` binding.

---

## Experimental / Draft

These ideas are **not implemented** and have **no source code** in the
package. They are recorded here so consumers and contributors can see
the intended direction.

### 3D octree variant (target: v0.6+)

A 3D variant for platformer / 2.5D broadphase queries.

```typescript
// Draft only — no implementation in v0.3.x.
interface AABB3 {
  x: number; y: number; z: number;
  width: number; height: number; depth: number;
}

interface Octree<T extends AABB3> {
  insert(obj: T): void;
  retrieve(region: AABB3): T[];
  retrieveInto(region: AABB3, target: T[]): T[];
  clear(): void;
  dispose(): void;
  readonly disposed: boolean;
}

export function createOctree<T extends AABB3>(opts: {
  bounds: AABB3;
  maxObjects?: number;
  maxLevels?: number;
}): Octree<T>;
```

Open questions:
- Is a 2.5D quadtree with z-binning sufficient for typical platformer
  collision (likely yes)?
- Acceptable size increase for the octree path (target ≤ 1500 B gzip
  additional)?

Implementation is gated on a v0.5+ game actually needing it. Until
then, consumers requiring 3D broadphase should pull a dedicated
library (e.g. `octree-ts`).

---

## Out of scope (will not implement)

- Move-tracking (per-frame rebuild via `clear()` + `insert()` is the
  intended pattern; see README "Why aiquadtreejs").
- Precise hit-test (broadphase only; caller does narrow-phase).
- Circle / Line / polygon primitives.
- Persistence / serialisation.
- KD-tree / R-tree variants.
