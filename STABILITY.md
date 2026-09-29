# aiquadtreejs Stability

## Stable Surface

| Surface | Status | Notes |
| --- | --- | --- |
| `createQuadtree()` | Stable | Root factory. |
| `AABB`, `QuadtreeOptions`, `Quadtree<T>` | Stable | Public types. |
| `insert`, `retrieve`, `retrieveInto`, `clear`, `dispose` | Stable | Main methods. |
| `disposed` (read-only getter) | Stable | `true` once `dispose()` has been called. |
| Error classes | Stable | `QuadtreeError`, `QuadtreeDisposedError`. |

## Behavioral Contract

- Bounds use right-open coordinates.
- `createQuadtree()` validates before the tree exists, in this order: the options argument is an object, `bounds` is an object, the four `bounds` fields are finite (each read once), `width > 0`, `height > 0`, `maxObjects` is a positive integer, `maxLevels` is a positive integer.
- Nodes store their min/max edges. The root's exclusive edges are `x + width` and `y + height`, computed once; each child takes its parent's exact edges and midpoint, so no edge is ever re-derived from a width.
- Inserted object references are not cloned. They are re-read whenever their node subdivides, so an object moved before the next `clear()` is routed by its new coordinates.
- Retrieval is broadphase and deduplicated, and it is complete: every inserted object that shares a point with the query region inside `bounds` is returned. On each axis a zero extent is the point `{x}` and a positive extent is the right-open span `[x, x + width)`. Brute-force property tests pin this.
- `retrieve()` and `retrieveInto()` read each region field once and walk with the validated values.
- `retrieveInto()` checks that `target` is an array before touching it, preserves its identity, and clears it first.
- `clear()` drains node contents and scratch references.
- `dispose()` is idempotent and permanent. After it, every other method throws `QuadtreeDisposedError` before validating its arguments.
- Misuse errors are `QuadtreeError`; every message starts with `aiquadtreejs: `, and `error.name` equals the class name.
- Re-entrancy: the tree dispatches no events, runs no callbacks and has no mailbox. The only user code it runs is property getters on `bounds`, query regions and inserted objects. `bounds` and region fields are read once before any state changes, so a region getter that calls back into the tree completes before the walk starts. Getters on inserted objects are re-read during `insert()` and later subdivisions and must not call back into the same tree. Separate trees are independent.

## Zero-Size Point Boundary Semantics

Zero-size points (width = 0, height = 0) follow right-open `[x, x+width)` semantics on the root boundary: a point exactly on the minimum `x/y` edge is **inclusive** and will be inserted and retrieved correctly. A point at the exclusive maximum edge (`bounds.x + bounds.width`, `bounds.y + bounds.height`) is outside the root and is ignored. This was a known bug in versions before 0.5.8; it is fixed and covered by tests as of 0.5.8.

## Out of Scope

Precise collision checks, physics integration, spatial hashing, and 3D octrees are outside the current package.
