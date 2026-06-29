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

## Zero-Size Point Boundary Semantics

Zero-size points (width = 0, height = 0) follow right-open `[x, x+width)` semantics on the root boundary: a point exactly on the minimum `x/y` edge is **inclusive** and will be inserted and retrieved correctly. A point at the exclusive maximum edge (`bounds.x + bounds.width`, `bounds.y + bounds.height`) is outside the root and is ignored. This was a known bug in versions before 0.5.8; it is fixed and covered by tests as of 0.5.8.

## Out of Scope

Precise collision checks, physics integration, spatial hashing, and 3D octrees are outside the current package.
