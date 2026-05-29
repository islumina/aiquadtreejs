# aiquadtreejs

[![npm version](https://img.shields.io/npm/v/aiquadtreejs.svg)](https://www.npmjs.com/package/aiquadtreejs)
[![CI](https://github.com/yshengliao/aiquadtreejs/actions/workflows/ci.yml/badge.svg)](https://github.com/yshengliao/aiquadtreejs/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-brightgreen.svg)](LICENSE)
[![AI Generated](https://img.shields.io/badge/AI_Generated-Claude_Code_Opus_4.7_Max-blueviolet.svg)](https://www.anthropic.com/claude-code)
[![繁體中文](https://img.shields.io/badge/lang-繁體中文-red.svg)](README_ZHTW.md)

> A tiny 2D quadtree for per-frame rebuild collision broadphase. `insert` AABBs, `retrieve` candidates, `clear`. Caller does precise hit-testing. Designed for PixiJS games with 500–10,000 active entities.

Part of the [ai\*js micro-runtime ecosystem](https://github.com/yshengliao) — see also [aifsmjs](https://github.com/yshengliao/aifsmjs) (FSM), [aiecsjs](https://github.com/yshengliao/aiecsjs) (ECS), [aibridgejs](https://github.com/yshengliao/aibridgejs) (cross-context RPC), [aieventjs](https://github.com/yshengliao/aieventjs) (event emitter), [aipooljs](https://github.com/yshengliao/aipooljs) (object pool), and [aiaudiojs](https://github.com/yshengliao/aiaudiojs) (Web Audio shell).

> **Status: 0.3.1 published.** `retrieveInto(region, target)` is a steady-state zero-allocation broadphase (reused internal scratch + caller buffer); property-based dedup invariants. ≥95% coverage, ≤2 KB gzip.

---

## Why aiquadtreejs

Naïve pairwise collision detection on `N` entities is `O(N²)`. At 1,000 entities that's a million comparisons per frame, which at 60 Hz is already a budget killer; at 10,000 entities it's a non-starter. A quadtree replaces the dense outer loop with a spatial filter: each entity asks "who could I possibly collide with?" and the tree returns a small candidate set — sub-linear on average for well-distributed inputs (worst case is `O(N)` when every object overlaps the query region). The precise hit test then runs only on candidates, dropping the actual comparisons by one or two orders of magnitude in typical game distributions.

`aiquadtreejs` makes four deliberate trade-offs:

- **Per-frame rebuild, not move-tracking.** Tracking which leaf an entity migrated into between frames is doable but error-prone; `clear()` + re-`insert()` is faster in practice and easier to reason about. This mirrors the Kontra.js philosophy. (`clear()` resets the root node and drops the child array; subdividing fresh next frame is cheap because the inner subdivision logic touches at most `maxLevels = 4` levels.)
- **Set-based dedup on `retrieve`.** An AABB that straddles a quadrant boundary lands in multiple leaves. Without dedup the caller sees the same candidate two or four times and pays double for the precise hit test. The Set guarantees each candidate appears once.
- **2D AABB only — no 3D, no R-tree, no KD-tree, no Circle / Line primitives.** Those are real techniques for real problems but they sit in a different size class. Keep this library at ≤ 2 KB gzipped and let user-land bring in heavier broadphase when needed.
- **No precise hit-test.** Broadphase libraries that also do collision response always grow. The contract here ends at "here are the candidates"; pixel-perfect or shape-specific tests belong to whatever physics layer you already have.

Why not just import `@timohausmann/quadtree-ts`? That library is solid and you should use it for stand-alone work. `aiquadtreejs` exists so that an ai*js stack can talk to entity IDs from `aiecsjs` without per-frame object adaptation — `insert({ id: eid, x, y, width, height })` lines up with the SoA columns you already maintain.

> `aiquadtreejs` is one of the four 0.3-cycle siblings joining the family — alongside [aipooljs](https://github.com/yshengliao/aipooljs) (object pool), `aieventjs` (typed events; self-built, not a `mitt` fork — see the [evaluation in LEARNINGS.md](../LEARNINGS.md)), and `aiaudiojs` (Web Audio shell over a Howler.js `peerDependency`).

---

## Quick Start

```bash
pnpm add aiquadtreejs
```

```typescript
import { createQuadtree, type AABB } from "aiquadtreejs";

type Body = { id: number } & AABB;

// 1. Build the tree once.
const qt = createQuadtree<Body>({
  bounds: { x: 0, y: 0, width: 800, height: 600 },
  maxObjects: 10,
  maxLevels: 4,
});

// 2. Per frame: clear and re-insert.
function rebuild(entities: Body[]) {
  qt.clear();
  for (const e of entities) qt.insert(e);
}

// 3. Per query: broadphase, then precise hit-test.
function nearbyEnemies(player: Body, enemies: Body[]): Body[] {
  const region: AABB = { x: player.x - 50, y: player.y - 50, width: 100, height: 100 };
  const candidates = qt.retrieve(region);
  // Caller filters with precise AABB / pixel test:
  return candidates.filter((c) => aabbOverlap(c, region));
}
```

Coordinate semantics match PixiJS `getBounds()`: `x + width` and `y + height` are exclusive.

---

## Capabilities / Limitations

| Will do (v1)                                              | Won't do                                              |
| --------------------------------------------------------- | ----------------------------------------------------- |
| 2D rectangle quadtree                                     | 3D octree / R-tree / KD-tree                          |
| `insert()` / `retrieve()` / `clear()` / `dispose()`       | Move-tracking (use `clear()` + re-`insert()`)         |
| Set-based dedup on `retrieve` (each candidate once)       | Precise hit-test (broadphase only)                    |
| `maxObjects` + `maxLevels` knobs                          | Auto-rebalance / dynamic depth growth                 |
| Reuse the root node across frames; resubdivide cheaply    | Circle / Line / polygon primitives                    |
| `dispose()` idempotent; post-dispose calls throw          | Persistence / snapshot / serialise (out of scope)     |

---

## API sketch

```typescript
interface AABB {
  x: number;
  y: number;
  width: number;   // x + width is exclusive
  height: number;  // y + height is exclusive
}

interface QuadtreeOptions {
  bounds: AABB;
  maxObjects?: number;   // default 10
  maxLevels?: number;    // default 4
}

interface Quadtree<T extends AABB> {
  insert(obj: T): void;
  retrieve(region: AABB): T[];
  retrieveInto(region: AABB, target: T[]): T[];   // ← new in 0.3.0
  clear(): void;
  dispose(): void;
  readonly disposed: boolean;
}

class QuadtreeError extends Error {}
class QuadtreeDisposedError extends Error {}

function createQuadtree<T extends AABB>(opts: QuadtreeOptions): Quadtree<T>;
```

Full JSDoc lives in [`src/index.ts`](src/index.ts).

---

## Roadmap

| Version    | Adds                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **0.1.0**  | `createQuadtree`, `insert` / `retrieve` / `clear` / `dispose`, Set-based dedup, ≥95% coverage, ≤2 KB gzip.                              |
| **0.3.0**  | `retrieveInto(region, target)` zero-alloc API; property-based tests (`fast-check`); STABILITY.md tracking.                            |
| **0.6+**   | Evaluate 3D octree variant (`createOctree<T extends AABB3>`); see `STABILITY.md` for current draft.                                  |

---

## License

[MIT](LICENSE).
