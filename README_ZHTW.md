# aiquadtreejs

[![npm version](https://img.shields.io/npm/v/aiquadtreejs.svg)](https://www.npmjs.com/package/aiquadtreejs)
[![CI](https://github.com/yshengliao/aiquadtreejs/actions/workflows/ci.yml/badge.svg)](https://github.com/yshengliao/aiquadtreejs/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-brightgreen.svg)](LICENSE)
[![AI Generated](https://img.shields.io/badge/AI_Generated-Claude_Code_Opus_4.7_Max-blueviolet.svg)](https://www.anthropic.com/claude-code)
[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md)

> 一個小型 2D quadtree，給 per-frame rebuild 的碰撞 broadphase 使用。`insert` AABB、`retrieve` 候選、`clear`，精確碰撞測試由呼叫方負責。瞄準 PixiJS 遊戲 500–10,000 個 active entity 的場景。

隸屬 [ai\*js micro-runtime 生態系](https://github.com/yshengliao) ─ 另見 [aifsmjs](https://github.com/yshengliao/aifsmjs)（FSM）、[aiecsjs](https://github.com/yshengliao/aiecsjs)（ECS）、[aibridgejs](https://github.com/yshengliao/aibridgejs)（cross-context RPC）、[aieventjs](https://github.com/yshengliao/aieventjs)（event emitter）、[aipooljs](https://github.com/yshengliao/aipooljs)（物件池）、[aiaudiojs](https://github.com/yshengliao/aiaudiojs)（Web Audio 薄殼）。

> **狀態：0.0.1 scaffold。** 下方 API surface 已凍結；實作在 0.1.0 落地。目前 `createQuadtree` 被呼叫會直接 `throw "not implemented"`。

---

## 為什麼有 aiquadtreejs

對 `N` 個 entity 做 N² 兩兩碰撞比對，1,000 個 entity 就是百萬次比對，在 60 Hz 已經吃光預算；10,000 個 entity 直接破表。Quadtree 把那個密集外層 loop 換成空間過濾器：每個 entity 問「我可能會撞到誰？」，樹回傳一個小的候選集，平均 `O(log N)`。精確碰撞測試只跑在候選上，實際比較數量降一到兩個量級。

`aiquadtreejs` 刻意做這四個取捨：

- **Per-frame rebuild，不追蹤移動。** 追蹤 entity 跨幀在哪個 leaf 之間遷移，能做但容易出錯；對重用 node object 的樹做 `clear()` + re-`insert()`，實測更快、心智模型更乾淨。這跟 Kontra.js 哲學一致。
- **`retrieve` 用 Set 去重。** 跨象限的 AABB 會落進多個 leaf；不去重的話呼叫方會看到同一個候選 2 或 4 次，精確碰撞測試成本翻倍。Set 保證每個候選只出現一次。
- **只做 2D AABB ── 不做 3D、不做 R-tree / KD-tree、不做 Circle / Line。** 那些是針對特定問題的好技術，但屬於不同 size class。這個套件壓在 ≤ 2 KB gzip，更重的 broadphase 由 user-land 帶。
- **不做精確碰撞測試。** Broadphase + 碰撞回應綁在一起的套件永遠在膨脹。本套件契約止於「這是候選名單」；pixel-perfect 或特殊形狀的精確測試交給你已經有的 physics layer。

那為什麼不直接用 `@timohausmann/quadtree-ts`？它做得很好，獨立場景直接用沒問題。`aiquadtreejs` 存在的理由是讓 ai*js stack 能直接接 `aiecsjs` 的 entity ID，不必每 frame 再轉一次物件 ── `insert({ id: eid, x, y, width, height })` 直接對齊你已經維護的 SoA 欄位。

> `aiquadtreejs` 是 v0.3 cycle 四個新加入兄弟套件之一 ── 另外三個是 [aipooljs](https://github.com/yshengliao/aipooljs)（物件池）、`aieventjs`（typed event；**自寫不 fork mitt**，理由見 [LEARNINGS.md 的評估](../LEARNINGS.md)）、`aiaudiojs`（Web Audio 薄殼，底層用 Howler.js 作 `peerDependency`）。

---

## Quick Start

```bash
pnpm add aiquadtreejs
```

```typescript
import { createQuadtree, type AABB } from "aiquadtreejs";

type Body = { id: number } & AABB;

// 1. 建一次。
const qt = createQuadtree<Body>({
  bounds: { x: 0, y: 0, width: 800, height: 600 },
  maxObjects: 10,
  maxLevels: 4,
});

// 2. 每 frame：clear 然後重新 insert。
function rebuild(entities: Body[]) {
  qt.clear();
  for (const e of entities) qt.insert(e);
}

// 3. 每次查詢：broadphase 再精確碰撞。
function nearbyEnemies(player: Body, enemies: Body[]): Body[] {
  const region: AABB = { x: player.x - 50, y: player.y - 50, width: 100, height: 100 };
  const candidates = qt.retrieve(region);
  // 呼叫方做精確 AABB / pixel 測試：
  return candidates.filter((c) => aabbOverlap(c, region));
}
```

座標語意對齊 PixiJS `getBounds()`：`x + width` 與 `y + height` 都是**右開**（不含）。

---

## 能做 / 不做

| 會做（v1）                                                | 不會做                                                |
| --------------------------------------------------------- | ----------------------------------------------------- |
| 2D rectangle quadtree                                     | 3D octree / R-tree / KD-tree                          |
| `insert()` / `retrieve()` / `clear()` / `dispose()`       | 追蹤移動（用 `clear()` + re-`insert()`）              |
| `retrieve` Set 去重（每候選只出現一次）                   | 精確碰撞測試（只做 broadphase）                       |
| `maxObjects` + `maxLevels` 旋鈕                           | Auto-rebalance / 動態深度成長                         |
| 跨 frame 重用 node slot（零 GC churn）                    | Circle / Line / Polygon 原型                          |
| `dispose()` 冪等；dispose 後呼叫拋錯                      | Persistence / snapshot / serialise（不在範圍內）      |

---

## API 草稿

```typescript
interface AABB {
  x: number;
  y: number;
  width: number;   // x + width 為右開（不含）
  height: number;  // y + height 為右開（不含）
}

interface QuadtreeOptions {
  bounds: AABB;
  maxObjects?: number;   // 預設 10
  maxLevels?: number;    // 預設 4
}

interface Quadtree<T extends AABB> {
  insert(obj: T): void;
  retrieve(region: AABB): T[];
  clear(): void;
  dispose(): void;
  readonly disposed: boolean;
}

class QuadtreeError extends Error {}
class QuadtreeDisposedError extends Error {}

function createQuadtree<T extends AABB>(opts: QuadtreeOptions): Quadtree<T>;
```

完整 JSDoc 在 [`src/index.ts`](src/index.ts)。

---

## Roadmap

| 版本       | 加入內容                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **0.1.0**  | `createQuadtree`、`insert` / `retrieve` / `clear` / `dispose`、Set 去重、≥95% coverage、≤2 KB gzip。                                     |
| **0.2.0**  | opt-in `retrieveInto(target: T[])` ── 寫進呼叫方傳入的 array，省掉每 frame alloc 新 array。                                              |
| **0.3+**   | 評估與 `aiecsjs` query 的 zero-copy 介接（消費 entity ID 的 `Uint32Array` view，不必經 AABB plain object）。                              |

---

## License

[MIT](LICENSE)。
