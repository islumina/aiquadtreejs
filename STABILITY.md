# aiquadtreejs Stability

## Stable Surface

| Surface | Status | Notes |
| --- | --- | --- |
| `createQuadtree()` | Stable | Root factory. |
| `AABB`, `QuadtreeOptions`, `Quadtree<T>` | Stable | Public types. |
| `insert`, `retrieve`, `retrieveInto`, `clear`, `dispose` | Stable | Main methods. |
| Error classes | Stable | `QuadtreeError`, `QuadtreeDisposedError`. |

## Behavioral Contract

- Bounds use right-open coordinates.
- Inserted object references are not cloned.
- Retrieval is broadphase and deduplicated.
- `retrieveInto()` preserves target array identity and clears it first.
- `clear()` drains node contents and scratch references.
- `dispose()` is idempotent and permanent.

## Current Caveat

A zero-size point on the root minimum `x/y` boundary is known to be ignored by the current root overlap check. Treat this as a documented bug, not a stable behavior.

## Out of Scope

Precise collision checks, physics integration, spatial hashing, and 3D octrees are outside the current package.
