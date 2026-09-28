# aiquadtreejs

小型 2D quadtree，用於每 frame 重建的 collision broadphase。插入 AABB、取回候選物件，精確碰撞檢查由呼叫端負責。

> **狀態：0.5.9 - 穩定 1.0 軌道 API。** root entry 是公開 API。

## 安裝

```bash
pnpm add aiquadtreejs
```

```ts
import { createQuadtree, type AABB } from "aiquadtreejs";
```

## 快速開始

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

## 核心 API

- `createQuadtree<T extends AABB>({ bounds, maxObjects?, maxLevels? })` 建立 tree。
- `insert(obj)` 將物件參照存進重疊 nodes。
- `retrieve(region)` 回傳 dedup 後的 broadphase candidates。
- `retrieveInto(region, target)` 重用呼叫端提供的 result array。
- `clear()` 清空 tree 與 scratch buffers，準備下一 frame。
- `dispose()` 是可重複呼叫的永久 teardown。
- Errors：`QuadtreeError`、`QuadtreeDisposedError`。

## Model

- 座標採 right-open：`{ x, y, width, height }` 覆蓋 `[x, x + width)` 與 `[y, y + height)`。
- 這只是 broadphase。回傳候選物件不保證真的與 query region 相交。
- 預期用法是每 frame 重建：`clear()`、插入 active bodies、query。
- 跨 quadrant 的物件可能存在多個 child nodes；結果會 dedup。
- `maxLevels` 沒有硬上限。很高的值加上 spanning objects 可能建立巨大 node 數。

## 注意事項

- 零尺寸 point（width = 0, height = 0）遵循 right-open 的 `[x, x+width)` 語意：剛好落在 minimum `x/y` 邊界上的 point 屬於**包含**範圍，會被正確插入與取回；落在 exclusive 的 maximum 邊界上的 point 則在 root 之外，會被忽略。（0.5.8 之前是已知 bug，現已修正。）
- 完全在 bounds 外的物件不會被 retrieve 到。
- 負 width/height 與非有限座標會 throw。
- `retrieveInto()` 會先清空 target array 再寫入結果。
- `dispose()` 後除了 `dispose()` 本身外，所有方法都會丟 `QuadtreeDisposedError`。

## AI Context

- 短索引：[`llms.txt`](llms.txt)
- 完整生成內容：[`llms-full.txt`](llms-full.txt)
- 穩定度契約：[`STABILITY.md`](STABILITY.md)
- 目前 review backlog：[`REVIEW.md`](REVIEW.md)
- 版本紀錄：[`CHANGELOG.md`](CHANGELOG.md)

## License

MIT
