# aiquadtreejs

Tiny 2D quadtree for per-frame rebuild collision broadphase. Insert AABBs, retrieve candidates, then run precise collision checks yourself.

> **Status: 0.5.6 - stable 1.0-track surface.** The root entry is the public API.

## Install

```bash
pnpm add aiquadtreejs
```

```ts
import { createQuadtree, type AABB } from "aiquadtreejs";
```

## Quick Start

```ts
interface Body extends AABB {
  id: number;
}

const tree = createQuadtree<Body>({
  bounds: { x: 0, y: 0, width: 800, height: 600 },
  maxObjects: 10,
  maxLevels: 4,
});

const bodies: Body[] = [
  { id: 1, x: 100, y: 100, width: 32, height: 32 },
  { id: 2, x: 400, y: 250, width: 32, height: 32 },
];

tree.clear();
for (const body of bodies) tree.insert(body);

const candidates = tree.retrieve({ x: 80, y: 80, width: 120, height: 120 });
```

## Core API

- `createQuadtree<T extends AABB>({ bounds, maxObjects?, maxLevels? })` creates a tree.
- `insert(obj)` stores an object reference in overlapping nodes.
- `retrieve(region)` returns a deduplicated broadphase candidate array.
- `retrieveInto(region, target)` reuses a caller-owned result array.
- `clear()` empties the tree for the next frame and clears scratch buffers.
- `dispose()` is idempotent permanent teardown.
- Errors: `QuadtreeError`, `QuadtreeDisposedError`.

## Model

- Coordinates are right-open: `{ x, y, width, height }` covers `[x, x + width)` and `[y, y + height)`.
- This is a broadphase only. Returned candidates may not actually overlap the query region.
- Expected usage is per-frame rebuild: `clear()`, insert active bodies, query.
- Objects spanning quadrant boundaries can be stored in multiple child nodes; results are deduplicated.
- `maxLevels` has no hard cap. Very high values plus spanning objects can create huge node counts.

## Sharp Edges

- Known bug: a zero-size point exactly on the root `left/top` boundary, such as `{ x: bounds.x, y: bounds.y, width: 0, height: 0 }`, is currently ignored by the root overlap check. Zero-size objects away from that root minimum edge are covered by tests. Next code pass should fix the root containment helper and add boundary tests.
- Fully outside objects are ignored by retrieval.
- Negative width/height and non-finite coordinates throw.
- `retrieveInto()` clears the target array before writing results.
- After `dispose()`, all methods except `dispose()` throw `QuadtreeDisposedError`.

## AI Context

- Short index: [`llms.txt`](llms.txt)
- Full generated context: [`llms-full.txt`](llms-full.txt)
- Stability contract: [`STABILITY.md`](STABILITY.md)
- Current review backlog: [`REVIEW.md`](REVIEW.md)
- Release history: [`CHANGELOG.md`](CHANGELOG.md)

## License

MIT
