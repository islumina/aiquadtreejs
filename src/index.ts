// aiquadtreejs — 2D quadtree for per-frame rebuild collision broadphase.
//
// Plain-object nodes, iterative-DFS retrieve, Set-based dedup, idempotent
// dispose, destructurable methods (no `this`). Version: see package.json.

/**
 * Axis-aligned bounding box.
 *
 * Right-open coordinate semantics: `x` / `y` are the top-left corner and
 * `x + width` / `y + height` are **exclusive**. A 32×32 box at `(0, 0)`
 * covers `[0, 32)` on both axes. (This matches the convention used by
 * renderers such as PixiJS `getBounds()`, but the type is renderer-agnostic.)
 *
 * @public
 */
export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Configuration for {@link createQuadtree}.
 *
 * @public
 */
export interface QuadtreeOptions {
  /**
   * Outer bounds. Objects partially outside `bounds` still insert into
   * whichever child nodes they overlap; objects fully outside are ignored
   * by `retrieve()` because no node overlaps them.
   *
   * Each field is read once, so accessor-backed bounds (e.g. PixiJS v8
   * `Bounds`) work. The root's exclusive edges are computed once as
   * `x + width` and `y + height`, and every right/bottom child shares its
   * parent's exact edge.
   */
  bounds: AABB;

  /**
   * Threshold above which a node subdivides. Default `10`. Lower values
   * mean deeper trees and fewer candidates per `retrieve()`; higher values
   * mean shallower trees and cheaper `insert()`.
   */
  maxObjects?: number;

  /**
   * Maximum subdivision depth. Default `4`. Caps recursion so a very dense
   * cluster doesn't blow up into an unbounded tree.
   *
   * **Spanning-object cost warning:** an object that spans multiple quadrant
   * boundaries is copied into every child node it overlaps. In the worst case
   * (an object covering the entire tree bounds) at depth `L`, up to `4^L`
   * nodes each hold a reference to that object. The default of `4` means at
   * most 256 leaf nodes; raising `maxLevels` to `10` allows ~1 M nodes, and
   * `20` allows ~10^12 — **OOM territory for dense inputs with spanning
   * objects**. Raise this value only when you understand the distribution of
   * large vs small objects in your scene. No upper-bound cap is applied
   * (the caller knows their workload); the default `4` is safe for typical
   * game scenes with 500–10,000 entities.
   *
   * **Precision-bound depth:** subdivision also stops once a node's
   * midpoint is no longer representable in floating point (its width or
   * height has fallen below the ulp of its coordinate) — typically around
   * depth 45-52 for typical scene-sized bounds, well below the 4^L node-count
   * concern above. Nodes past this depth become terminal leaves regardless
   * of `maxLevels`, so a very high `maxLevels` cannot make a dense point
   * cluster vanish from `retrieve()`.
   */
  maxLevels?: number;
}

/**
 * Quadtree storing objects that extend {@link AABB}. `T` may carry any
 * payload (entity ID, sprite reference, user data) alongside the geometry.
 *
 * The expected usage pattern is **per-frame rebuild**: at the start of each
 * frame, call `clear()` and re-`insert()` every active object. This is
 * cheaper than tracking movements through the tree and gives correct results
 * regardless of how objects moved.
 *
 * @public
 */
export interface Quadtree<T extends AABB> {
  /**
   * Insert an object. The same object reference may legitimately appear
   * in multiple leaf nodes when it spans quadrant boundaries; `retrieve()`
   * deduplicates with a `Set` so the caller sees it exactly once.
   *
   * @throws {@link QuadtreeError} if `obj` is `null` / `undefined`, if any of
   *   `x`, `y`, `width`, or `height` is non-finite (`NaN`, `Infinity`,
   *   `-Infinity`), or if `width` or `height` is negative. Zero-extent
   *   objects (points / lines) are valid.
   */
  insert(obj: T): void;

  /**
   * Return every inserted object whose containing node overlaps `region`,
   * deduplicated. The result is a **broadphase**: callers must still run
   * a precise AABB or pixel-level hit test on each candidate.
   *
   * Each `region` field is read once and the walk uses the validated values,
   * so an accessor-backed region behaves like a plain object.
   *
   * @throws {@link QuadtreeError} if `region` is `null` / `undefined`, if any
   *   of `region.x`, `region.y`, `region.width`, or `region.height` is
   *   non-finite (`NaN`, `Infinity`, `-Infinity`), or if `region.width` or
   *   `region.height` is negative. Zero-extent regions are valid (they still
   *   query any overlapping node).
   */
  retrieve(region: AABB): T[];

  /**
   * Reduced-allocation variant of {@link retrieve}.
   *
   * Clears `target` (sets `target.length = 0`), walks the tree using the same
   * iterative DFS + Set-based dedup as {@link retrieve}, then writes every
   * deduplicated candidate into `target` and returns it.
   *
   * Designed for hot-path callers (per-frame broadphase queries in a game
   * loop) that hold a permanent `T[]` buffer and want to avoid allocating a
   * fresh result array on every call.
   *
   * @invariant `target` identity is preserved — only its contents are
   *   replaced. `retrieveInto(r, buf) === buf` always holds.
   * @invariant After return, `target.length` equals the deduplicated
   *   candidate count. No `undefined` / `null` holes.
   * @invariant Empty result set → `target.length === 0`.
   * @invariant Dedup semantics identical to {@link retrieve}: objects
   *   spanning multiple quadrants appear exactly once.
   *
   * Allocation: this avoids the fresh result array that {@link retrieve}
   * allocates on every call — the internal DFS stack is reused across calls,
   * and results are written into the caller's `target` instead of a new
   * array. It does **not** allocate zero heap per call in practice: on V8,
   * clearing the internal dedup `Set` replaces its backing table and
   * `target.length = 0` drops the target array's backing store, so both are
   * rebuilt on the next call, at a cost proportional to the result size.
   * These are small, short-lived young-generation allocations, not the
   * unbounded fresh-array allocation `retrieve()` makes, but they do not
   * amortise away to literally zero.
   *
   * @throws {@link QuadtreeError} if `target` is not an array (checked
   *   before `target` is touched), or for the same `region` violations as
   *   {@link retrieve}. Zero-extent regions are valid.
   */
  retrieveInto(region: AABB, target: T[]): T[];

  /**
   * Reset the tree to empty. The root node object is reused across
   * frames; child nodes are released on clear() and re-created next
   * time subdivision triggers. The per-frame churn is bounded by
   * `4 * (subdivided-internal-node-count)` and stays well inside V8's
   * young-generation budget for typical game-loop usage.
   *
   * Internal scratch buffers (dedup `Set` + DFS stack) are also drained on
   * clear(), matching the GC guarantee already provided by {@link dispose}.
   * This ensures a tree held alive but not queried after clear() does not
   * retain the previous query's object references.
   */
  clear(): void;

  /**
   * Idempotent teardown. Drops references so the GC can reclaim everything.
   * After disposal, every method except `dispose` itself — `insert`,
   * `retrieve`, `retrieveInto`, `clear` — throws {@link QuadtreeDisposedError}.
   */
  dispose(): void;

  /** `true` once {@link dispose} has been called. */
  readonly disposed: boolean;
}

/**
 * Recoverable quadtree error — thrown by `createQuadtree` for a missing or
 * non-object options argument, a missing or non-object `bounds`, or invalid
 * construction options; by `insert()` for precondition violations (e.g. an
 * inserted object with non-finite coordinates or negative `width` /
 * `height`); by `retrieve()` / `retrieveInto()` for regions with non-finite
 * fields or negative `width` / `height`; and by `retrieveInto()` for a
 * `target` that is not an array.
 *
 * Every message starts with `aiquadtreejs: ` (e.g.
 * `aiquadtreejs: maxObjects must be a positive integer`) and `name` is
 * `"QuadtreeError"`. Match on the class, not the exact text.
 *
 * @public
 */
export class QuadtreeError extends Error {
  override readonly name = "QuadtreeError";
}

/**
 * Thrown by any quadtree method called after {@link Quadtree.dispose}.
 *
 * @public
 */
export class QuadtreeDisposedError extends Error {
  override readonly name = "QuadtreeDisposedError";
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

// A node covers the right-open rectangle [x0, x1) x [y0, y1). Edges are
// stored, never re-derived from a width: the root takes `x1 = x + width`
// once from the validated bounds, and each child takes its parent's exact
// edges and midpoint. Recomputing a right child's edge as `(x + w) + w` can
// land an ulp short of the parent's `x + width`, and an object routed into
// that sliver would then be missed by `retrieve()`.
interface Node<T extends AABB> {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  level: number;
  objects: T[];
  children: Node<T>[];
}

interface State<T extends AABB> {
  root: Node<T>;
  maxObjects: number;
  maxLevels: number;
  disposed: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeNode<T extends AABB>(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  level: number,
): Node<T> {
  return { x0, y0, x1, y1, level, objects: [], children: [] };
}

// Split line of [a, b). subdivide, quadrantIndices and isSplitRepresentable
// all use this one formula, so the routing midpoint is bit-for-bit the edge
// the children were built with.
function mid(a: number, b: number): number {
  return a + (b - a) / 2;
}

// Node/box overlap test used at the insert root gate and by retrieve's
// node walk (with the query region as `box`).
//
// Right-open semantics for positive-extent dimensions:
//   overlaps iff box.x < node.x1 AND box.x + box.width > node.x0
//
// Zero-extent exception for the minimum edge: a zero-size point sitting exactly
// on node.x0 or node.y0 satisfies neither side of the strict-inequality test,
// so it would be silently dropped (or, as a query, match no node). Instead, per axis:
//   - zero-extent: overlaps iff coordinate is within [x0, x1) —
//     inclusive minimum, exclusive maximum (right-open, matching the box contract)
//   - positive-extent: keep the strict right-open overlap
//
// This matches quadrantIndices' own zero-extent fallback (obj.x >= midX etc.)
// and preserves the invariant that a positive-size object flush on the right/bottom
// exclusive boundary stays rejected.
function nodeOverlaps<T extends AABB>(node: Node<T>, box: AABB): boolean {
  const inX =
    box.width === 0
      ? box.x >= node.x0 && box.x < node.x1
      : box.x < node.x1 && box.x + box.width > node.x0;
  const inY =
    box.height === 0
      ? box.y >= node.y0 && box.y < node.y1
      : box.y < node.y1 && box.y + box.height > node.y0;
  return inX && inY;
}

function quadrantIndices<T extends AABB>(node: Node<T>, obj: AABB): number[] {
  const midX = mid(node.x0, node.x1);
  const midY = mid(node.y0, node.y1);
  // Zero-extent objects (points) sitting exactly on midX / midY would fall
  // through both `<` and `>` checks; treat the point as belonging to the
  // right/bottom side so it doesn't silently disappear.
  const inLeft = obj.x < midX;
  const inRight = obj.width === 0 ? obj.x >= midX : obj.x + obj.width > midX;
  const inTop = obj.y < midY;
  const inBottom = obj.height === 0 ? obj.y >= midY : obj.y + obj.height > midY;
  const result: number[] = [];
  if (inTop && inLeft) result.push(0);
  if (inTop && inRight) result.push(1);
  if (inBottom && inLeft) result.push(2);
  if (inBottom && inRight) result.push(3);
  return result;
}

function subdivide<T extends AABB>(node: Node<T>): void {
  const { x0, y0, x1, y1 } = node;
  const midX = mid(x0, x1);
  const midY = mid(y0, y1);
  const lvl = node.level + 1;
  // TL, TR, BL, BR. Right/bottom children take the parent's exact x1/y1.
  node.children.push(
    makeNode(x0, y0, midX, midY, lvl),
    makeNode(midX, y0, x1, midY, lvl),
    makeNode(x0, midY, midX, y1, lvl),
    makeNode(midX, midY, x1, y1, lvl),
  );
  for (const obj of node.objects) {
    for (const i of quadrantIndices(node, obj)) {
      const child = node.children[i];
      if (child !== undefined) child.objects.push(obj);
    }
  }
  node.objects.length = 0;
}

// True while the node still has a representable midpoint on both axes,
// i.e. `mid(x0, x1)` actually lands strictly between `x0` and `x1` in
// floating point (and likewise for y). Once a node's extent falls below the
// ulp of its coordinate, the computed midpoint rounds onto `x0` or `x1`, so
// `subdivide()` would create children that are not smaller than their
// parent — an infinite-seeming split that silently stops matching queries
// instead of erroring. Below this point further subdivision is skipped and
// the node stays a terminal leaf even if `node.level < maxLevels`.
function isSplitRepresentable<T extends AABB>(node: Node<T>): boolean {
  const midX = mid(node.x0, node.x1);
  const midY = mid(node.y0, node.y1);
  return node.x0 < midX && midX < node.x1 && node.y0 < midY && midY < node.y1;
}

function insertNode<T extends AABB>(
  node: Node<T>,
  obj: T,
  maxObjects: number,
  maxLevels: number,
): void {
  // Reject objects entirely outside the root bounds; for inner nodes we
  // trust `quadrantIndices` to route correctly.
  // nodeOverlaps accepts zero-size points/lines sitting exactly on the
  // minimum (left/top) edge with inclusive semantics, whilst positive-size
  // objects retain right-open exclusion on the maximum edge.
  if (node.level === 0 && !nodeOverlaps(node, obj)) return;
  if (node.children.length === 4) {
    for (const i of quadrantIndices(node, obj)) {
      const child = node.children[i];
      if (child !== undefined) insertNode(child, obj, maxObjects, maxLevels);
    }
    return;
  }
  node.objects.push(obj);
  if (node.objects.length > maxObjects && node.level < maxLevels && isSplitRepresentable(node)) {
    subdivide(node);
  }
}

function clearNode<T extends AABB>(node: Node<T>): void {
  node.objects.length = 0;
  for (const child of node.children) {
    clearNode(child);
  }
  node.children.length = 0;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Construct a 2D quadtree.
 *
 * @example
 * ```ts
 * import { createQuadtree, type AABB } from "aiquadtreejs";
 *
 * interface Body extends AABB {
 *   id: number;
 * }
 *
 * const entities: Body[] = [
 *   { id: 1, x: 100, y: 100, width: 32, height: 32 },
 *   { id: 2, x: 400, y: 250, width: 32, height: 32 },
 * ];
 * const player: Body = { id: 0, x: 200, y: 200, width: 32, height: 32 };
 *
 * const qt = createQuadtree<Body>({
 *   bounds: { x: 0, y: 0, width: 800, height: 600 },
 *   maxObjects: 10,
 *   maxLevels: 4,
 * });
 *
 * // Per-frame:
 * qt.clear();
 * for (const e of entities) qt.insert(e);
 *
 * // Broadphase lookup near the player:
 * const region: AABB = { x: player.x - 50, y: player.y - 50, width: 100, height: 100 };
 * const candidates = qt.retrieve(region);
 * // Caller runs a precise hit test on `candidates`.
 * ```
 *
 * @throws {@link QuadtreeError} if `opts` is not an object, if `opts.bounds`
 *   is not an object, if any bounds field is non-finite, if `bounds.width` or
 *   `bounds.height` is not positive, or if `maxObjects` / `maxLevels` is not
 *   a positive integer. Checked in that order, before the tree exists.
 *
 * @public
 */
export function createQuadtree<T extends AABB>(opts: QuadtreeOptions): Quadtree<T> {
  if (opts === null || typeof opts !== "object") {
    throw new QuadtreeError("aiquadtreejs: options must be an object with bounds");
  }
  const bounds = opts.bounds;
  if (bounds === null || typeof bounds !== "object") {
    throw new QuadtreeError(
      "aiquadtreejs: bounds must be an object with finite numeric x, y, width and height",
    );
  }
  const maxObjects = opts.maxObjects ?? 10;
  const maxLevels = opts.maxLevels ?? 4;
  // Read each field once: accessor-backed bounds (e.g. PixiJS v8 `Bounds`)
  // would be lost by an object spread, and a second read could disagree
  // with the validated value.
  const bx = bounds.x;
  const by = bounds.y;
  const bw = bounds.width;
  const bh = bounds.height;

  if (
    !Number.isFinite(bx) ||
    !Number.isFinite(by) ||
    !Number.isFinite(bw) ||
    !Number.isFinite(bh)
  ) {
    throw new QuadtreeError("aiquadtreejs: bounds must contain finite numbers");
  }
  if (bw <= 0) {
    throw new QuadtreeError("aiquadtreejs: bounds.width must be > 0");
  }
  if (bh <= 0) {
    throw new QuadtreeError("aiquadtreejs: bounds.height must be > 0");
  }
  if (!Number.isInteger(maxObjects) || maxObjects <= 0) {
    throw new QuadtreeError("aiquadtreejs: maxObjects must be a positive integer");
  }
  if (!Number.isInteger(maxLevels) || maxLevels <= 0) {
    throw new QuadtreeError("aiquadtreejs: maxLevels must be a positive integer");
  }

  const state: State<T> = {
    root: makeNode(bx, by, bx + bw, by + bh, 0),
    maxObjects,
    maxLevels,
    disposed: false,
  };

  function ck(): void {
    if (state.disposed) throw new QuadtreeDisposedError("aiquadtreejs: quadtree has been disposed");
  }

  function insert(obj: T): void {
    ck();
    if (
      !obj ||
      !Number.isFinite(obj.x) ||
      !Number.isFinite(obj.y) ||
      !Number.isFinite(obj.width) ||
      !Number.isFinite(obj.height)
    ) {
      throw new QuadtreeError(
        "aiquadtreejs: inserted object must be defined with finite numeric x, y, width and height",
      );
    }
    if (obj.width < 0) {
      throw new QuadtreeError("aiquadtreejs: inserted object width must be >= 0");
    }
    if (obj.height < 0) {
      throw new QuadtreeError("aiquadtreejs: inserted object height must be >= 0");
    }
    insertNode(state.root, obj, state.maxObjects, state.maxLevels);
  }

  // Reusable scratch for retrieveSet, hoisted to avoid a fresh DFS stack per
  // call. Safe because the returned Set never escapes the module: retrieve
  // copies it out via Array.from and retrieveInto via a push loop, both
  // synchronously and fully before any subsequent call. Note that
  // scratchSet.clear() still rebuilds the Set's backing table on V8, so this
  // does not make retrieveInto literally allocation-free — see its JSDoc.
  const scratchSet = new Set<T>();
  const scratchStack: Node<T>[] = [];
  const scratchRegion: AABB = { x: 0, y: 0, width: 0, height: 0 };

  // Validate `region` and collect the deduplicated candidates into scratchSet.
  //
  // Each region field is read exactly once, validated, and only then copied
  // into scratchRegion, so an accessor-backed region (e.g. PixiJS v8 `Bounds`)
  // walks with the values that passed validation, and a getter that calls
  // back into this tree completes during the four reads, before this call
  // touches the shared scratch. Optional chaining turns a nullish region into
  // the same QuadtreeError as a non-finite field.
  function retrieveSet(region: AABB): Set<T> {
    const rx = region?.x;
    const ry = region?.y;
    const rw = region?.width;
    const rh = region?.height;
    if (
      !Number.isFinite(rx) ||
      !Number.isFinite(ry) ||
      !Number.isFinite(rw) ||
      !Number.isFinite(rh)
    ) {
      throw new QuadtreeError(
        "aiquadtreejs: retrieve region must have finite numeric x, y, width and height",
      );
    }
    if (rw < 0) {
      throw new QuadtreeError("aiquadtreejs: retrieve region width must be >= 0");
    }
    if (rh < 0) {
      throw new QuadtreeError("aiquadtreejs: retrieve region height must be >= 0");
    }
    scratchRegion.x = rx;
    scratchRegion.y = ry;
    scratchRegion.width = rw;
    scratchRegion.height = rh;
    scratchSet.clear();
    scratchStack.length = 0;
    scratchStack.push(state.root);
    while (scratchStack.length > 0) {
      const node = scratchStack.pop();
      if (node === undefined) continue;
      if (!nodeOverlaps(node, scratchRegion)) continue;
      for (const obj of node.objects) scratchSet.add(obj);
      for (const child of node.children) scratchStack.push(child);
    }
    return scratchSet;
  }

  function retrieve(region: AABB): T[] {
    ck();
    return Array.from(retrieveSet(region));
  }

  function retrieveInto(region: AABB, target: T[]): T[] {
    ck();
    if (!Array.isArray(target)) {
      throw new QuadtreeError("aiquadtreejs: retrieveInto target must be an array");
    }
    const set = retrieveSet(region);
    target.length = 0;
    for (const v of set) target.push(v);
    return target;
  }

  function clear(): void {
    ck();
    clearNode(state.root);
    // Drain internal scratch so that a tree held alive but not queried after
    // clear() does not pin the previous query's object references against GC.
    // (dispose() drains scratch for the same reason; clear() now provides the
    // same guarantee for the per-frame rebuild pattern.)
    scratchSet.clear();
    scratchStack.length = 0;
  }

  function dispose(): void {
    if (state.disposed) return;
    state.disposed = true;
    state.root.objects.length = 0;
    state.root.children.length = 0;
    scratchSet.clear();
    scratchStack.length = 0;
  }

  return {
    insert,
    retrieve,
    retrieveInto,
    clear,
    dispose,
    get disposed() {
      return state.disposed;
    },
  };
}
