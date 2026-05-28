// aiquadtreejs — 2D quadtree for per-frame rebuild collision broadphase.
//
// v0.0.1 scaffold: types and JSDoc are stable; implementation is intentionally
// stubbed (`throw`) until 0.1.0 wires up the runtime.

/**
 * Axis-aligned bounding box.
 *
 * Coordinate semantics follow PixiJS `getBounds()`: `x` / `y` are the top-left
 * corner and `x + width` / `y + height` are **exclusive**. A 32×32 sprite at
 * `(0, 0)` covers pixels `[0, 32)` on both axes.
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
   */
  insert(obj: T): void;

  /**
   * Return every inserted object whose containing node overlaps `region`,
   * deduplicated. The result is a **broadphase**: callers must still run
   * a precise AABB or pixel-level hit test on each candidate.
   */
  retrieve(region: AABB): T[];

  /**
   * Reset every node back to empty. Internal node objects are reused
   * across frames so per-frame rebuild does not pressure the GC.
   */
  clear(): void;

  /**
   * Idempotent teardown. Drops references so the GC can reclaim everything.
   * Subsequent `insert` / `retrieve` / `clear` throw {@link QuadtreeDisposedError}.
   */
  dispose(): void;

  /** `true` once {@link dispose} has been called. */
  readonly disposed: boolean;
}

/**
 * Recoverable quadtree error — currently unused at the public surface, but
 * reserved for future precondition violations (e.g. an inserted object with
 * `NaN` coordinates or negative `width`).
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
  // v0.0.1 scaffold — implementation lands with 0.1.0.
  void opts;
  throw new Error("aiquadtreejs: not implemented (v0.0.1 scaffold)");
}
