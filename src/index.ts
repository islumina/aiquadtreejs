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
   * @throws {@link QuadtreeError} if any of `x`, `y`, `width`, or `height`
   *   is non-finite (`NaN`, `Infinity`, `-Infinity`), or if `width` or
   *   `height` is negative. Zero-extent objects (points / lines) are valid.
   */
  insert(obj: T): void;

  /**
   * Return every inserted object whose containing node overlaps `region`,
   * deduplicated. The result is a **broadphase**: callers must still run
   * a precise AABB or pixel-level hit test on each candidate.
   *
   * @throws {@link QuadtreeError} if any of `region.x`, `region.y`,
   *   `region.width`, or `region.height` is non-finite (`NaN`, `Infinity`,
   *   `-Infinity`), or if `region.width` or `region.height` is negative.
   *   Zero-extent regions are valid (they still query any overlapping node).
   */
  retrieve(region: AABB): T[];

  /**
   * Zero-allocation variant of {@link retrieve}.
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
   * Allocation: in steady state this performs no per-call heap allocation.
   * The dedup `Set` and DFS stack are reused across calls (cleared, not
   * re-created), and results are written into the caller's `target` instead
   * of a fresh array. The first calls may grow the internal scratch; once
   * result sizes stabilise, allocation amortises to zero — the design goal
   * for per-frame broadphase loops issuing thousands of queries.
   *
   * @throws {@link QuadtreeError} if any of `region.x`, `region.y`,
   *   `region.width`, or `region.height` is non-finite (`NaN`, `Infinity`,
   *   `-Infinity`), or if `region.width` or `region.height` is negative.
   *   Zero-extent regions are valid.
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
 * Recoverable quadtree error — thrown by `createQuadtree` for invalid
 * construction options and by `insert()` for precondition violations
 * (e.g. an inserted object with non-finite coordinates or negative
 * `width` / `height`).
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

interface Node<T extends AABB> {
  bounds: AABB;
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

function rectsOverlap(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// Root containment check used only at the insert root gate.
//
// Right-open semantics for positive-extent dimensions (matching rectsOverlap):
//   contained iff obj.x < bounds.x + bounds.width AND obj.x + obj.width > bounds.x
//
// Zero-extent exception for the minimum edge: a zero-size point sitting exactly
// on bounds.x or bounds.y satisfies neither side of the strict-inequality test,
// so it would be silently dropped. Instead, per axis:
//   - zero-extent: contained iff coordinate is within [bounds.min, bounds.max) —
//     inclusive minimum, exclusive maximum (right-open, matching the box contract)
//   - positive-extent: keep the existing strict right-open overlap (unchanged)
//
// This matches quadrantIndices' own zero-extent fallback (obj.x >= midX etc.)
// and preserves the invariant that a positive-size object flush on the right/bottom
// exclusive boundary stays rejected.
function rootContains(bounds: AABB, obj: AABB): boolean {
  const inX =
    obj.width === 0
      ? obj.x >= bounds.x && obj.x < bounds.x + bounds.width
      : obj.x < bounds.x + bounds.width && obj.x + obj.width > bounds.x;
  const inY =
    obj.height === 0
      ? obj.y >= bounds.y && obj.y < bounds.y + bounds.height
      : obj.y < bounds.y + bounds.height && obj.y + obj.height > bounds.y;
  return inX && inY;
}

function quadrantIndices<T extends AABB>(node: Node<T>, obj: AABB): number[] {
  const midX = node.bounds.x + node.bounds.width / 2;
  const midY = node.bounds.y + node.bounds.height / 2;
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
  const w = node.bounds.width / 2;
  const h = node.bounds.height / 2;
  const x = node.bounds.x;
  const y = node.bounds.y;
  const lvl = node.level + 1;
  node.children.push(
    { bounds: { x, y, width: w, height: h }, level: lvl, objects: [], children: [] },
    { bounds: { x: x + w, y, width: w, height: h }, level: lvl, objects: [], children: [] },
    { bounds: { x, y: y + h, width: w, height: h }, level: lvl, objects: [], children: [] },
    { bounds: { x: x + w, y: y + h, width: w, height: h }, level: lvl, objects: [], children: [] },
  );
  for (const obj of node.objects) {
    for (const i of quadrantIndices(node, obj)) {
      const child = node.children[i];
      if (child !== undefined) child.objects.push(obj);
    }
  }
  node.objects.length = 0;
}

function insertNode<T extends AABB>(
  node: Node<T>,
  obj: T,
  maxObjects: number,
  maxLevels: number,
): void {
  // Reject objects entirely outside the root bounds; for inner nodes we
  // trust `quadrantIndices` to route correctly (it has zero-extent fallback
  // logic that `rectsOverlap` does not, so the strict check is too tight
  // at child level for points sitting on a child boundary).
  // rootContains is used instead of rectsOverlap here so that zero-size
  // points/lines sitting exactly on the minimum (left/top) edge are accepted
  // with inclusive semantics, whilst positive-size objects retain right-open
  // exclusion on the maximum edge.
  if (node.level === 0 && !rootContains(node.bounds, obj)) return;
  if (node.children.length === 4) {
    for (const i of quadrantIndices(node, obj)) {
      const child = node.children[i];
      if (child !== undefined) insertNode(child, obj, maxObjects, maxLevels);
    }
    return;
  }
  node.objects.push(obj);
  if (node.objects.length > maxObjects && node.level < maxLevels) {
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
 * @public
 */
export function createQuadtree<T extends AABB>(opts: QuadtreeOptions): Quadtree<T> {
  const { bounds } = opts;
  const maxObjects = opts.maxObjects ?? 10;
  const maxLevels = opts.maxLevels ?? 4;

  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height)
  ) {
    throw new QuadtreeError("bounds must contain finite numbers");
  }
  if (bounds.width <= 0) {
    throw new QuadtreeError("bounds.width must be > 0");
  }
  if (bounds.height <= 0) {
    throw new QuadtreeError("bounds.height must be > 0");
  }
  if (!Number.isInteger(maxObjects) || maxObjects <= 0) {
    throw new QuadtreeError("maxObjects must be a positive integer");
  }
  if (!Number.isInteger(maxLevels) || maxLevels <= 0) {
    throw new QuadtreeError("maxLevels must be a positive integer");
  }

  const state: State<T> = {
    root: {
      bounds: { ...bounds },
      level: 0,
      objects: [],
      children: [],
    },
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
        "inserted object must be defined with finite numeric x, y, width and height",
      );
    }
    if (obj.width < 0) {
      throw new QuadtreeError("inserted object width must be >= 0");
    }
    if (obj.height < 0) {
      throw new QuadtreeError("inserted object height must be >= 0");
    }
    insertNode(state.root, obj, state.maxObjects, state.maxLevels);
  }

  // Reusable scratch for retrieveSet, hoisted so steady-state queries
  // allocate nothing. Safe because the returned Set never escapes the
  // module: retrieve copies it out via Array.from and retrieveInto via a
  // push loop, both synchronously and fully before any subsequent call.
  //
  // Plain-data assumption (tightened, QDT-B-02): region.x/y/width/height
  // are read once into locals at the top of retrieveSet, then written into
  // the reusable scratchRegion (no per-query allocation — the zero-alloc
  // contract of retrieveInto holds). This prevents a structurally-typed
  // region whose getter calls back into retrieve* from corrupting the shared
  // scratch mid-walk: any re-entrant call triggered by a getter completes
  // synchronously during the four reads, before this call touches scratch.
  // Adversarial-only: plain-object callers (all documented examples) are
  // unaffected.
  const scratchSet = new Set<T>();
  const scratchStack: Node<T>[] = [];
  const scratchRegion: AABB = { x: 0, y: 0, width: 0, height: 0 };

  function retrieveSet(region: AABB): Set<T> {
    // Snapshot region fields into locals once so that a getter-bearing
    // region cannot mutate the walk by re-entering retrieve* mid-DFS.
    const rx = region.x;
    const ry = region.y;
    const rw = region.width;
    const rh = region.height;
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
      if (!rectsOverlap(node.bounds, scratchRegion)) continue;
      for (const obj of node.objects) scratchSet.add(obj);
      for (const child of node.children) scratchStack.push(child);
    }
    return scratchSet;
  }

  /**
   * Validate a region AABB for use in retrieve / retrieveInto.
   * Non-finite coordinates or negative dimensions throw QuadtreeError with
   * an `aiquadtreejs: ` prefix message.
   */
  function validateRegion(region: AABB): void {
    if (
      !region ||
      !Number.isFinite(region.x) ||
      !Number.isFinite(region.y) ||
      !Number.isFinite(region.width) ||
      !Number.isFinite(region.height)
    ) {
      throw new QuadtreeError(
        "aiquadtreejs: retrieve region must have finite numeric x, y, width and height",
      );
    }
    if (region.width < 0) {
      throw new QuadtreeError("aiquadtreejs: retrieve region width must be >= 0");
    }
    if (region.height < 0) {
      throw new QuadtreeError("aiquadtreejs: retrieve region height must be >= 0");
    }
  }

  function retrieve(region: AABB): T[] {
    ck();
    validateRegion(region);
    return Array.from(retrieveSet(region));
  }

  function retrieveInto(region: AABB, target: T[]): T[] {
    ck();
    validateRegion(region);
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
