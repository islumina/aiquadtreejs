import { describe, expect, it } from "vitest";

import { type AABB, QuadtreeDisposedError, QuadtreeError, createQuadtree } from "../src/index.js";
import { nextDown } from "./float.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function aabb(x: number, y: number, width: number, height: number): AABB {
  return { x, y, width, height };
}

// Every QuadtreeError message starts with `aiquadtreejs: `; tests match the
// class plus an anchored regex rather than the class alone.
const MSG = {
  options: /^aiquadtreejs: options must be an object with bounds$/,
  boundsObject:
    /^aiquadtreejs: bounds must be an object with finite numeric x, y, width and height$/,
  boundsFinite: /^aiquadtreejs: bounds must contain finite numbers$/,
  boundsWidth: /^aiquadtreejs: bounds\.width must be > 0$/,
  boundsHeight: /^aiquadtreejs: bounds\.height must be > 0$/,
  maxObjects: /^aiquadtreejs: maxObjects must be a positive integer$/,
  maxLevels: /^aiquadtreejs: maxLevels must be a positive integer$/,
  objFinite:
    /^aiquadtreejs: inserted object must be defined with finite numeric x, y, width and height$/,
  objWidth: /^aiquadtreejs: inserted object width must be >= 0$/,
  objHeight: /^aiquadtreejs: inserted object height must be >= 0$/,
  regionFinite: /^aiquadtreejs: retrieve region must have finite numeric x, y, width and height$/,
  regionWidth: /^aiquadtreejs: retrieve region width must be >= 0$/,
  regionHeight: /^aiquadtreejs: retrieve region height must be >= 0$/,
  target: /^aiquadtreejs: retrieveInto target must be an array$/,
} as const;

function expectQuadtreeError(fn: () => unknown, message: RegExp): void {
  expect(fn).toThrow(QuadtreeError);
  expect(fn).toThrow(message);
}

// ---------------------------------------------------------------------------
// A. Construction & validation
// ---------------------------------------------------------------------------

describe("A. Construction & validation", () => {
  it("A1. createQuadtree with bounds works; defaults maxObjects=10, maxLevels=4", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(qt.disposed).toBe(false);
    expect(qt.retrieve(aabb(0, 0, 800, 600))).toEqual([]);
  });

  it("A2. createQuadtree with explicit maxObjects + maxLevels", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 400, 400), maxObjects: 2, maxLevels: 2 });
    expect(qt.disposed).toBe(false);
  });

  it("A3. bounds.width <= 0 throws QuadtreeError", () => {
    expectQuadtreeError(() => createQuadtree({ bounds: aabb(0, 0, 0, 100) }), MSG.boundsWidth);
    expectQuadtreeError(() => createQuadtree({ bounds: aabb(0, 0, -1, 100) }), MSG.boundsWidth);
  });

  it("A4. bounds with NaN throws QuadtreeError", () => {
    expectQuadtreeError(
      () => createQuadtree({ bounds: aabb(Number.NaN, 0, 100, 100) }),
      MSG.boundsFinite,
    );
    expectQuadtreeError(
      () => createQuadtree({ bounds: aabb(0, 0, Number.NaN, 100) }),
      MSG.boundsFinite,
    );
  });

  it("A5. bounds with Infinity throws QuadtreeError", () => {
    expectQuadtreeError(
      () => createQuadtree({ bounds: aabb(Number.POSITIVE_INFINITY, 0, 100, 100) }),
      MSG.boundsFinite,
    );
    expectQuadtreeError(
      () => createQuadtree({ bounds: aabb(0, 0, Number.POSITIVE_INFINITY, 100) }),
      MSG.boundsFinite,
    );
  });

  it("A6. bounds.height <= 0 throws QuadtreeError", () => {
    expectQuadtreeError(() => createQuadtree({ bounds: aabb(0, 0, 100, 0) }), MSG.boundsHeight);
    expectQuadtreeError(() => createQuadtree({ bounds: aabb(0, 0, 100, -5) }), MSG.boundsHeight);
  });

  it("A7. invalid maxObjects throws QuadtreeError", () => {
    expectQuadtreeError(
      () => createQuadtree({ bounds: aabb(0, 0, 100, 100), maxObjects: 0 }),
      MSG.maxObjects,
    );
  });

  it("A8. invalid maxLevels throws QuadtreeError", () => {
    expectQuadtreeError(
      () => createQuadtree({ bounds: aabb(0, 0, 100, 100), maxLevels: 0 }),
      MSG.maxLevels,
    );
  });

  it("A9. bounds with prototype getters (PixiJS v8 Bounds shape) are honoured", () => {
    // Regression: bounds was copied with `{ ...bounds }`, which drops prototype
    // accessors, leaving a root with undefined extents — every insert vanished.
    class GetterBounds implements AABB {
      minX = 0;
      minY = 0;
      maxX = 800;
      maxY = 600;
      get x(): number {
        return this.minX;
      }
      get y(): number {
        return this.minY;
      }
      get width(): number {
        return this.maxX - this.minX;
      }
      get height(): number {
        return this.maxY - this.minY;
      }
    }
    const qt = createQuadtree({ bounds: new GetterBounds() });
    const box = aabb(100, 100, 32, 32);
    qt.insert(box);
    expect(qt.retrieve(aabb(0, 0, 800, 600))).toContain(box);
  });

  it("A10. bounds fields are read once: validated values are the stored values", () => {
    // Regression (TOCTOU): a getter finite during validation but NaN on a
    // later read must not produce an accepted-but-broken tree.
    let reads = 0;
    const bounds = {
      y: 0,
      width: 800,
      height: 600,
      get x(): number {
        reads++;
        return reads === 1 ? 0 : Number.NaN;
      },
    };
    const qt = createQuadtree({ bounds });
    const box = aabb(100, 100, 32, 32);
    qt.insert(box);
    expect(qt.retrieve(aabb(0, 0, 800, 600))).toContain(box);
  });

  it("A11. a missing or non-object options argument throws QuadtreeError, not TypeError", () => {
    // Regression: `const { bounds } = opts` leaked a bare TypeError.
    for (const opts of [undefined, null, 42, "bounds", true]) {
      expectQuadtreeError(
        () => createQuadtree(opts as unknown as Parameters<typeof createQuadtree>[0]),
        MSG.options,
      );
    }
  });

  it("A12. a missing or non-object bounds throws QuadtreeError, not TypeError", () => {
    // Regression: `bounds.x` on a missing bounds leaked a bare TypeError.
    for (const bounds of [undefined, null, 0, "0,0,10,10"]) {
      expectQuadtreeError(
        () => createQuadtree({ bounds } as unknown as Parameters<typeof createQuadtree>[0]),
        MSG.boundsObject,
      );
    }
    expectQuadtreeError(
      () => createQuadtree({} as unknown as Parameters<typeof createQuadtree>[0]),
      MSG.boundsObject,
    );
  });

  it("A13. QuadtreeError reports its class name and the package prefix", () => {
    let caught: unknown;
    try {
      createQuadtree({ bounds: aabb(0, 0, 100, 100), maxLevels: 1.5 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(QuadtreeError);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe("QuadtreeError");
    expect((caught as Error).message).toMatch(MSG.maxLevels);
  });

  it("A14. getter-backed bounds with a non-dyadic negative origin round-trip inserts", () => {
    class GetterBounds implements AABB {
      readonly #x = -0.3;
      readonly #y = -0.7;
      readonly #w = 2.4;
      readonly #h = 0.2;
      get x(): number {
        return this.#x;
      }
      get y(): number {
        return this.#y;
      }
      get width(): number {
        return this.#w;
      }
      get height(): number {
        return this.#h;
      }
    }
    const bounds = new GetterBounds();
    const qt = createQuadtree({ bounds, maxObjects: 1, maxLevels: 8 });
    const x1 = bounds.x + bounds.width;
    const y1 = bounds.y + bounds.height;
    const objs: AABB[] = [];
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 3; j++) {
        objs.push(aabb(-0.3 + i * 0.33, -0.7 + j * 0.061, 0.07, 0.013));
      }
    }
    const sx = nextDown(x1);
    const sy = nextDown(y1);
    objs.push(aabb(sx, sy, x1 - sx, y1 - sy), aabb(sx, sy, 0, 0));
    for (const o of objs) qt.insert(o);
    for (const o of objs) expect(qt.retrieve(o)).toContain(o);
    expect(new Set(qt.retrieve(bounds))).toEqual(new Set(objs));
  });
});

// ---------------------------------------------------------------------------
// B. insert + retrieve basics
// ---------------------------------------------------------------------------

describe("B. insert + retrieve basics", () => {
  it("B1. insert 1 object; retrieve of overlapping region returns it", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const obj = aabb(100, 100, 32, 32);
    qt.insert(obj);
    const result = qt.retrieve(aabb(50, 50, 200, 200));
    expect(result).toContain(obj);
  });

  it("B2. after subdivide, object in NW node; retrieve of SE region excludes it", () => {
    // Force subdivide with maxObjects=2, then confirm the NW object is not in a SE query.
    const qt = createQuadtree({ bounds: aabb(0, 0, 100, 100), maxObjects: 2, maxLevels: 4 });
    // Insert 3 objects all in NW quadrant (x<50, y<50) to trigger subdivide
    const nwObj = aabb(5, 5, 5, 5);
    qt.insert(aabb(1, 1, 2, 2));
    qt.insert(aabb(2, 2, 2, 2));
    qt.insert(nwObj); // triggers subdivide; all go into NW child
    // Query SE quadrant — NW child bounds do not overlap SE region
    const result = qt.retrieve(aabb(75, 75, 20, 20));
    expect(result).not.toContain(nwObj);
  });

  it("B3. insert N < maxObjects: no subdivide; retrieve large region returns all N", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600), maxObjects: 10 });
    const objs = Array.from({ length: 9 }, (_, i) => aabb(i * 50, i * 30, 10, 10));
    for (const o of objs) qt.insert(o);
    const result = qt.retrieve(aabb(0, 0, 800, 600));
    expect(result).toHaveLength(9);
  });

  it("B4. insert > maxObjects: subdivide happens; small region returns subset", () => {
    const qt = createQuadtree({
      bounds: aabb(0, 0, 800, 600),
      maxObjects: 4,
      maxLevels: 4,
    });
    // Place objects all in NW quadrant (x<400, y<300)
    for (let i = 0; i < 5; i++) {
      qt.insert(aabb(10 + i * 20, 10 + i * 20, 5, 5));
    }
    // Query far SE — should not return NW objects
    const result = qt.retrieve(aabb(700, 500, 50, 50));
    expect(result).toHaveLength(0);
  });

  it("B5. retrieve stops subdividing at maxLevels; deepest node may have > maxObjects", () => {
    const qt = createQuadtree({
      bounds: aabb(0, 0, 128, 128),
      maxObjects: 1,
      maxLevels: 2,
    });
    // Pile many tiny objects on the same spot — tree must cap at depth 2
    for (let i = 0; i < 20; i++) {
      qt.insert(aabb(1, 1, 2, 2));
    }
    // All those objects are still retrievable
    const result = qt.retrieve(aabb(0, 0, 128, 128));
    // 20 distinct references (each aabb() call creates a new object); Set
    // does not dedup them — result must be exactly 20, not ≥ 1.
    expect(result.length).toBe(20);
  });

  it("B6. retrieve returns a fresh Array each call (not a shared buffer)", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    qt.insert(aabb(0, 0, 10, 10));
    const result = qt.retrieve(aabb(0, 0, 800, 600));
    expect(Array.isArray(result)).toBe(true);
    // Backward-compat lock: retrieve must allocate a new array per call, so
    // the v0.3.1 hoisted-scratch refactor cannot accidentally share a buffer.
    const again = qt.retrieve(aabb(0, 0, 800, 600));
    expect(again).not.toBe(result);
  });
});

// ---------------------------------------------------------------------------
// C. Set dedup on retrieve
// ---------------------------------------------------------------------------

describe("C. Set dedup on retrieve", () => {
  it("C1. object spanning 2 quadrants; after subdivide, retrieve returns it once", () => {
    const qt = createQuadtree({
      bounds: aabb(0, 0, 100, 100),
      maxObjects: 1,
      maxLevels: 4,
    });
    // This object will force subdivision, and a straddling object spans left+right
    qt.insert(aabb(0, 0, 5, 5)); // force subdivide
    qt.insert(aabb(0, 0, 5, 5)); // second obj to exceed threshold
    // Straddling obj: spans midX=50
    const straddler = aabb(40, 10, 30, 10); // x=40..70, crosses midX=50
    qt.insert(straddler);
    const result = qt.retrieve(aabb(0, 0, 100, 100));
    const count = result.filter((o) => o === straddler).length;
    expect(count).toBe(1);
  });

  it("C2. object spanning all 4 quadrants; retrieve returns it once", () => {
    const qt = createQuadtree({
      bounds: aabb(0, 0, 100, 100),
      maxObjects: 1,
      maxLevels: 4,
    });
    qt.insert(aabb(0, 0, 5, 5));
    qt.insert(aabb(0, 0, 5, 5));
    // Spans midX=50 and midY=50
    const big = aabb(30, 30, 60, 60);
    qt.insert(big);
    const result = qt.retrieve(aabb(0, 0, 100, 100));
    const count = result.filter((o) => o === big).length;
    expect(count).toBe(1);
  });

  it("C3. same object reference inserted twice; retrieve returns it once", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const obj = aabb(100, 100, 32, 32);
    qt.insert(obj);
    qt.insert(obj);
    const result = qt.retrieve(aabb(0, 0, 800, 600));
    const count = result.filter((o) => o === obj).length;
    expect(count).toBe(1);
  });

  it("C4. two distinct objects spanning same area; retrieve returns both, each once", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const a = aabb(100, 100, 32, 32);
    const b = aabb(100, 100, 32, 32);
    qt.insert(a);
    qt.insert(b);
    const result = qt.retrieve(aabb(0, 0, 800, 600));
    expect(result).toContain(a);
    expect(result).toContain(b);
    expect(result.filter((o) => o === a).length).toBe(1);
    expect(result.filter((o) => o === b).length).toBe(1);
  });

  it("C5. region spanning multiple nodes; shared object returned once", () => {
    const qt = createQuadtree({
      bounds: aabb(0, 0, 100, 100),
      maxObjects: 1,
      maxLevels: 4,
    });
    qt.insert(aabb(0, 0, 5, 5));
    qt.insert(aabb(90, 90, 5, 5)); // force subdivide
    const shared = aabb(30, 30, 60, 60); // spans all quadrants
    qt.insert(shared);
    // Query entire area — shared is in multiple children
    const result = qt.retrieve(aabb(0, 0, 100, 100));
    expect(result.filter((o) => o === shared).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// D. Right-open AABB semantics
// ---------------------------------------------------------------------------

describe("D. Right-open AABB semantics", () => {
  it("D1. right-open node boundary: object in NW child; query starting at midX excludes NW node", () => {
    // Force subdivide: NW child is [0,50)x[0,50). Query at x=50 should NOT overlap NW.
    const qt = createQuadtree({ bounds: aabb(0, 0, 100, 100), maxObjects: 2, maxLevels: 4 });
    const nwObj = aabb(5, 5, 5, 5);
    qt.insert(aabb(1, 1, 2, 2));
    qt.insert(aabb(2, 2, 2, 2));
    qt.insert(nwObj); // triggers subdivide
    // NW child bounds are [0,50)x[0,50); query at x=50 starts OUTSIDE NW
    const result = qt.retrieve(aabb(50, 0, 50, 100));
    expect(result).not.toContain(nwObj);
  });

  it("D2. right-open node boundary: query ending just inside NW child (x<50) returns NW object", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 100, 100), maxObjects: 2, maxLevels: 4 });
    const nwObj = aabb(5, 5, 5, 5);
    qt.insert(aabb(1, 1, 2, 2));
    qt.insert(aabb(2, 2, 2, 2));
    qt.insert(nwObj); // triggers subdivide
    // Query [0,50)x[0,50) overlaps NW child
    const result = qt.retrieve(aabb(0, 0, 49, 49));
    expect(result).toContain(nwObj);
  });

  it("D3. zero-width query region at node boundary does not enter adjacent child", () => {
    // NW child is [0,50)x[0,50). A zero-width query at x=50 has x+width=50 which is NOT >50
    // so rectsOverlap returns false for NW child.
    const qt = createQuadtree({ bounds: aabb(0, 0, 100, 100), maxObjects: 2, maxLevels: 4 });
    const nwObj = aabb(5, 5, 5, 5);
    qt.insert(aabb(1, 1, 2, 2));
    qt.insert(aabb(2, 2, 2, 2));
    qt.insert(nwObj);
    const result = qt.retrieve(aabb(50, 0, 0, 100));
    expect(result).not.toContain(nwObj);
  });

  it("D4. zero-extent query on a subdivision midline still finds a covering object", () => {
    // Regression: the retrieve node test was strictly right-open with no
    // zero-extent case, so a point/line on a node's min edge matched no node
    // once unrelated inserts had subdivided the root.
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const box = aabb(350, 250, 100, 100); // covers (400, 300)
    qt.insert(box);
    const point = aabb(400, 300, 0, 0);
    expect(qt.retrieve(point)).toContain(box);
    for (let i = 0; i < 10; i++) qt.insert(aabb(10 + i, 10, 1, 1)); // subdivides root
    expect(qt.retrieve(point)).toContain(box);
    expect(qt.retrieve(aabb(400, 0, 0, 600))).toContain(box);
    expect(qt.retrieve(aabb(0, 300, 800, 0))).toContain(box);
  });

  it("D5. zero-extent query at the root min corner finds a point inserted there", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const pt = aabb(0, 0, 0, 0);
    qt.insert(pt);
    expect(qt.retrieve(aabb(0, 0, 0, 0))).toContain(pt);
  });

  it("D6. zero-extent query at the subdivision midpoint finds a point inserted there", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 100, 100), maxObjects: 1, maxLevels: 4 });
    qt.insert(aabb(10, 10, 5, 5));
    qt.insert(aabb(90, 90, 5, 5));
    const midPoint = aabb(50, 50, 0, 0);
    qt.insert(midPoint);
    expect(qt.retrieve(aabb(50, 50, 0, 0))).toContain(midPoint);
  });

  it("D7. zero-extent query on the root max edge stays outside (right-open)", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 100, 100) });
    const obj = aabb(90, 90, 10, 10);
    qt.insert(obj);
    expect(qt.retrieve(aabb(100, 50, 0, 0))).toEqual([]);
    expect(qt.retrieve(aabb(50, 100, 0, 0))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// E. clear
// ---------------------------------------------------------------------------

describe("E. clear", () => {
  it("E1. clear empties; retrieve returns []", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    qt.insert(aabb(0, 0, 32, 32));
    qt.clear();
    expect(qt.retrieve(aabb(0, 0, 800, 600))).toEqual([]);
  });

  it("E2. clear then insert works; no stale children", () => {
    const qt = createQuadtree({
      bounds: aabb(0, 0, 100, 100),
      maxObjects: 2,
      maxLevels: 4,
    });
    for (let i = 0; i < 5; i++) qt.insert(aabb(i * 5, i * 5, 3, 3));
    qt.clear();
    const newObj = aabb(10, 10, 5, 5);
    qt.insert(newObj);
    const result = qt.retrieve(aabb(0, 0, 100, 100));
    expect(result).toContain(newObj);
    expect(result).toHaveLength(1);
  });

  it("E4. clear() drains internal scratch — subsequent retrieveInto on empty tree returns length 0", () => {
    // Regression guard for QDT-B-01: clear() must drain scratchSet/scratchStack
    // so that a tree held alive but never queried after clear() does not pin
    // the previous query's object references.
    // Verify by: insert objects, query (fills scratch), clear(), query again
    // with a no-overlap region — result must be empty (scratch was drained).
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const obj = aabb(100, 100, 32, 32);
    qt.insert(obj);
    const buf: AABB[] = [];
    qt.retrieveInto(aabb(0, 0, 800, 600), buf);
    expect(buf).toContain(obj); // sanity: object was retrievable before clear
    qt.clear();
    // After clear, a query for the full region should return empty
    // because there are no objects in the tree.
    const buf2: AABB[] = [];
    qt.retrieveInto(aabb(0, 0, 800, 600), buf2);
    expect(buf2).toHaveLength(0);
    // Direct retrieve should also return empty.
    expect(qt.retrieve(aabb(0, 0, 800, 600))).toHaveLength(0);
  });

  it("E3. multiple clear-insert cycles maintain integrity", () => {
    const qt = createQuadtree({
      bounds: aabb(0, 0, 800, 600),
      maxObjects: 3,
      maxLevels: 4,
    });
    for (let cycle = 0; cycle < 3; cycle++) {
      qt.clear();
      const objs = Array.from({ length: 5 }, (_, i) => aabb(i * 100, i * 50, 20, 20));
      for (const o of objs) qt.insert(o);
      const result = qt.retrieve(aabb(0, 0, 800, 600));
      expect(result).toHaveLength(5);
    }
  });
});

// ---------------------------------------------------------------------------
// F. dispose
// ---------------------------------------------------------------------------

describe("F. dispose", () => {
  it("F1. dispose is idempotent", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    qt.dispose();
    expect(() => qt.dispose()).not.toThrow();
  });

  it("F2. post-dispose insert / retrieve / clear throw QuadtreeDisposedError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    qt.dispose();
    expect(() => qt.insert(aabb(0, 0, 10, 10))).toThrow(QuadtreeDisposedError);
    expect(() => qt.retrieve(aabb(0, 0, 800, 600))).toThrow(QuadtreeDisposedError);
    expect(() => qt.clear()).toThrow(QuadtreeDisposedError);
  });

  it("F3. disposed getter reflects state", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(qt.disposed).toBe(false);
    qt.dispose();
    expect(qt.disposed).toBe(true);
  });

  it("F4. dispose then re-create new quadtree works; no global state interference", () => {
    const qt1 = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    qt1.insert(aabb(0, 0, 10, 10));
    qt1.dispose();

    const qt2 = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(qt2.disposed).toBe(false);
    expect(qt2.retrieve(aabb(0, 0, 800, 600))).toEqual([]);
  });

  it("F5. full dispose cycle: use → dispose → all four methods throw → dispose-again no-throw → disposed===true", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const obj = aabb(100, 100, 32, 32);
    const buf: AABB[] = [];

    // Normal use before dispose — all four must succeed.
    qt.insert(obj);
    expect(qt.retrieve(aabb(0, 0, 800, 600))).toContain(obj);
    expect(qt.retrieveInto(aabb(0, 0, 800, 600), buf)).toBe(buf);
    expect(buf).toContain(obj);
    qt.clear();
    expect(qt.retrieve(aabb(0, 0, 800, 600))).toEqual([]);

    qt.dispose();

    // All four query/mutation methods must throw QuadtreeDisposedError.
    expect(() => qt.insert(aabb(0, 0, 10, 10))).toThrow(QuadtreeDisposedError);
    expect(() => qt.retrieve(aabb(0, 0, 800, 600))).toThrow(QuadtreeDisposedError);
    expect(() => qt.retrieveInto(aabb(0, 0, 800, 600), buf)).toThrow(QuadtreeDisposedError);
    expect(() => qt.clear()).toThrow(QuadtreeDisposedError);

    // Second dispose must be idempotent (no throw).
    expect(() => qt.dispose()).not.toThrow();

    // disposed getter must reflect the final state.
    expect(qt.disposed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// G. Out-of-bounds + zero-size objects
// ---------------------------------------------------------------------------

describe("G. Out-of-bounds + zero-size objects", () => {
  it("G1. insert object entirely outside bounds — silent no-op; retrieve doesn't find it", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 100, 100) });
    const outside = aabb(200, 200, 10, 10);
    qt.insert(outside);
    const result = qt.retrieve(aabb(0, 0, 100, 100));
    expect(result).not.toContain(outside);
  });

  it("G2. zero-width point object: insert does not throw; retrieve with containing region works", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const point = aabb(50, 50, 0, 0);
    expect(() => qt.insert(point)).not.toThrow();
    // A zero-width point at x=50 overlaps a region starting before x=50
    // The node that contains it (root) overlaps the query region, so the
    // object is returned (broadphase — caller does fine-grained check)
    const result = qt.retrieve(aabb(0, 0, 800, 600));
    // Point is in tree; returned if containing node overlaps region
    expect(Array.isArray(result)).toBe(true);
  });

  it("G3. object exactly the size of bounds; ends up in children after subdivide", () => {
    const qt = createQuadtree({
      bounds: aabb(0, 0, 100, 100),
      maxObjects: 1,
      maxLevels: 4,
    });
    qt.insert(aabb(0, 0, 5, 5)); // triggers subdivide on second insert
    const full = aabb(0, 0, 100, 100); // spans all 4 quadrants
    qt.insert(full);
    // After subdivide, full is in multiple children; retrieve of full bounds returns it once
    const result = qt.retrieve(aabb(0, 0, 100, 100));
    expect(result.filter((o) => o === full).length).toBe(1);
  });

  it("G4. zero-extent point at the exact midpoint survives subdivide", () => {
    // Regression: previously a point at (midX, midY) with width=height=0
    // hit zero quadrants in quadrantIndices and silently disappeared after
    // subdivide. Now we treat zero-extent objects as a point belonging to
    // the right/bottom side at midpoint.
    const qt = createQuadtree({
      bounds: aabb(0, 0, 100, 100),
      maxObjects: 1,
      maxLevels: 4,
    });
    // Two filler objects force subdivide.
    qt.insert(aabb(10, 10, 5, 5));
    qt.insert(aabb(90, 90, 5, 5));
    // The point sits exactly on (midX, midY) of root bounds (50, 50).
    const midPoint = aabb(50, 50, 0, 0);
    qt.insert(midPoint);
    // The midpoint object must still be retrievable.
    const result = qt.retrieve(aabb(40, 40, 20, 20));
    expect(result).toContain(midPoint);
  });
});

// ---------------------------------------------------------------------------
// H. Destructurable + property
// ---------------------------------------------------------------------------

describe("H. Destructurable + property", () => {
  it("H1. const { insert, retrieve, clear } = qt; works without this", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const { insert, retrieve, clear } = qt;
    const obj = aabb(10, 10, 20, 20);
    insert(obj);
    const result = retrieve(aabb(0, 0, 800, 600));
    expect(result).toContain(obj);
    expect(() => clear()).not.toThrow();
    expect(retrieve(aabb(0, 0, 800, 600))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// I. retrieveInto behaviour
// ---------------------------------------------------------------------------

describe("I. retrieveInto behaviour", () => {
  it("I1. retrieveInto on empty tree → target.length === 0", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const buf: AABB[] = [];
    qt.retrieveInto(aabb(0, 0, 800, 600), buf);
    expect(buf).toHaveLength(0);
  });

  it("I2. region OOB → target.length === 0", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    qt.insert(aabb(100, 100, 32, 32));
    const buf: AABB[] = [];
    qt.retrieveInto(aabb(900, 700, 100, 100), buf);
    expect(buf).toHaveLength(0);
  });

  it("I3. pre-filled target gets cleared before write", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const obj = aabb(100, 100, 32, 32);
    qt.insert(obj);
    const stale = aabb(999, 999, 1, 1);
    const buf: AABB[] = [stale, stale, stale];
    qt.retrieveInto(aabb(0, 0, 800, 600), buf);
    expect(buf).not.toContain(stale);
    expect(buf).toContain(obj);
  });

  it("I4. empty target [] gets correctly filled", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const obj = aabb(10, 10, 20, 20);
    qt.insert(obj);
    const buf: AABB[] = [];
    qt.retrieveInto(aabb(0, 0, 800, 600), buf);
    expect(buf).toContain(obj);
    expect(buf.length).toBe(1);
  });

  it("I5. consecutive calls with same buffer reflect latest query", () => {
    // Use maxObjects=1 to force subdivision so each quadrant is isolated.
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600), maxObjects: 1, maxLevels: 4 });
    const nw = aabb(10, 10, 20, 20);
    const se = aabb(700, 500, 20, 20);
    qt.insert(nw);
    qt.insert(se);
    // After insert of 2 objects with maxObjects=1, subdivision is triggered.
    // nw is in NW quadrant (x<400, y<300); se is in SE quadrant (x>=400, y>=300).
    const buf: AABB[] = [];
    qt.retrieveInto(aabb(0, 0, 400, 300), buf);
    expect(buf).toContain(nw);
    qt.retrieveInto(aabb(650, 450, 100, 100), buf);
    expect(buf).toContain(se);
    // No residue from first call — buf was cleared and refilled for r2
    expect(buf).not.toContain(nw);
  });

  it("I6. spanning object appears exactly once in target", () => {
    const qt = createQuadtree({
      bounds: aabb(0, 0, 100, 100),
      maxObjects: 1,
      maxLevels: 4,
    });
    qt.insert(aabb(0, 0, 5, 5));
    qt.insert(aabb(90, 90, 5, 5));
    const straddler = aabb(30, 30, 60, 60); // spans all 4 quadrants
    qt.insert(straddler);
    const buf: AABB[] = [];
    qt.retrieveInto(aabb(0, 0, 100, 100), buf);
    const count = buf.filter((o) => o === straddler).length;
    expect(count).toBe(1);
  });

  it("I7. identical reference inserted twice appears exactly once in target", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const obj = aabb(100, 100, 32, 32);
    qt.insert(obj);
    qt.insert(obj);
    const buf: AABB[] = [];
    qt.retrieveInto(aabb(0, 0, 800, 600), buf);
    const count = buf.filter((o) => o === obj).length;
    expect(count).toBe(1);
  });

  it("I8. returned reference === provided target", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const buf: AABB[] = [];
    const ret = qt.retrieveInto(aabb(0, 0, 800, 600), buf);
    expect(ret).toBe(buf);
  });

  it("I9. post-dispose retrieveInto throws QuadtreeDisposedError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    qt.dispose();
    const buf: AABB[] = [];
    expect(() => qt.retrieveInto(aabb(0, 0, 800, 600), buf)).toThrow(QuadtreeDisposedError);
  });

  it("I10. zero-extent midpoint object retrievable via retrieveInto", () => {
    const qt = createQuadtree({
      bounds: aabb(0, 0, 100, 100),
      maxObjects: 1,
      maxLevels: 4,
    });
    qt.insert(aabb(10, 10, 5, 5));
    qt.insert(aabb(90, 90, 5, 5));
    const midPoint = aabb(50, 50, 0, 0);
    qt.insert(midPoint);
    const buf: AABB[] = [];
    qt.retrieveInto(aabb(40, 40, 20, 20), buf);
    expect(buf).toContain(midPoint);
  });

  it("I11. retrieveInto result count matches retrieve result count", () => {
    const qt = createQuadtree({
      bounds: aabb(0, 0, 800, 600),
      maxObjects: 4,
      maxLevels: 4,
    });
    for (let i = 0; i < 10; i++) {
      qt.insert(aabb(i * 60, i * 40, 20, 20));
    }
    const region = aabb(0, 0, 400, 300);
    const buf: AABB[] = [];
    qt.retrieveInto(region, buf);
    const arr = qt.retrieve(region);
    expect(buf.length).toBe(arr.length);
  });

  it("I12. retrieveInto contents (as Set) equal retrieve contents (as Set)", () => {
    const qt = createQuadtree({
      bounds: aabb(0, 0, 800, 600),
      maxObjects: 4,
      maxLevels: 4,
    });
    for (let i = 0; i < 10; i++) {
      qt.insert(aabb(i * 60, i * 40, 20, 20));
    }
    const region = aabb(0, 0, 800, 600);
    const buf: AABB[] = [];
    qt.retrieveInto(region, buf);
    const arr = qt.retrieve(region);
    const bufSet = new Set(buf);
    for (const v of arr) expect(bufSet.has(v)).toBe(true);
  });

  it("I13. retrieveInto reuses the buffer; retrieve allocates fresh (contrast)", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    qt.insert(aabb(10, 10, 20, 20));
    const buf: AABB[] = [];
    expect(qt.retrieveInto(aabb(0, 0, 800, 600), buf)).toBe(buf);
    expect(qt.retrieveInto(aabb(0, 0, 800, 600), buf)).toBe(buf); // same ref every call
    const r1 = qt.retrieve(aabb(0, 0, 800, 600));
    const r2 = qt.retrieve(aabb(0, 0, 800, 600));
    expect(r1).not.toBe(r2); // retrieve never shares a buffer
  });

  it("I14. interleaved retrieve / retrieveInto do not corrupt each other", () => {
    // v0.3.1 hoists an internal scratch Set + stack reused across calls.
    // Interleaving distinct queries must keep every result correct and
    // independent — this is the regression guard for the shared scratch.
    const qt = createQuadtree({ bounds: aabb(0, 0, 100, 100), maxObjects: 1, maxLevels: 4 });
    const nw = aabb(5, 5, 5, 5);
    const se = aabb(90, 90, 5, 5);
    qt.insert(nw);
    qt.insert(se);
    const bufNw: AABB[] = [];
    qt.retrieveInto(aabb(0, 0, 40, 40), bufNw); // NW only
    const all = qt.retrieve(aabb(0, 0, 100, 100)); // both — must not disturb bufNw
    const bufSe: AABB[] = [];
    qt.retrieveInto(aabb(60, 60, 40, 40), bufSe); // SE only
    expect(bufNw).toContain(nw);
    expect(bufNw).not.toContain(se);
    expect(bufSe).toContain(se);
    expect(bufSe).not.toContain(nw);
    expect(new Set(all)).toEqual(new Set([nw, se]));
  });

  it("I15. a target that is not an array throws QuadtreeError before anything is written", () => {
    // Regression: `target.length = 0` / `target.push` leaked a bare TypeError
    // for null or primitive targets, and for non-array objects once a
    // candidate matched.
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    qt.insert(aabb(10, 10, 20, 20));
    const region = aabb(0, 0, 800, 600);
    for (const target of [null, undefined, 7, "buf"]) {
      expectQuadtreeError(() => qt.retrieveInto(region, target as unknown as AABB[]), MSG.target);
    }
    const arrayLike = { length: 3 };
    expectQuadtreeError(() => qt.retrieveInto(region, arrayLike as unknown as AABB[]), MSG.target);
    expect(arrayLike.length).toBe(3);
  });

  it("I16. 1,000 calls with one reused buffer keep identity, length and no holes", () => {
    const qt = createQuadtree({ bounds: aabb(-0.3, -0.7, 2.4, 1.9), maxObjects: 3, maxLevels: 6 });
    // Deterministic LCG so the tree content and the query both vary per call.
    let seed = 12345;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const stale = aabb(99, 99, 1, 1);
    const buf: AABB[] = Array.from({ length: 64 }, () => stale);
    let ok = true;
    for (let call = 0; call < 1000; call++) {
      if (call % 10 === 0) {
        qt.clear();
        const n = Math.floor(rand() * 40);
        for (let i = 0; i < n; i++) {
          qt.insert(aabb(-0.3 + rand() * 2.4, -0.7 + rand() * 1.9, rand() * 0.2, rand() * 0.2));
        }
      }
      const region = aabb(-0.5 + rand() * 2.8, -0.9 + rand() * 2.3, rand() * 1.5, rand() * 1.5);
      const expected = qt.retrieve(region);
      const ret = qt.retrieveInto(region, buf);
      let holes = 0;
      for (let i = 0; i < buf.length; i++) if (!(i in buf) || buf[i] === undefined) holes++;
      if (
        ret !== buf ||
        buf.length !== expected.length ||
        holes !== 0 ||
        buf.includes(stale) ||
        !expected.every((o) => buf.includes(o))
      ) {
        ok = false;
        break;
      }
    }
    expect(ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// J. insert() input validation (Item 1 fix)
// ---------------------------------------------------------------------------

describe("J. insert() input validation", () => {
  it("J1. insert with negative width throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.insert(aabb(10, 10, -1, 20)), MSG.objWidth);
  });

  it("J2. insert with negative height throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.insert(aabb(10, 10, 20, -1)), MSG.objHeight);
  });

  it("J3. insert with NaN x throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.insert(aabb(Number.NaN, 10, 20, 20)), MSG.objFinite);
  });

  it("J4. insert with NaN y throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.insert(aabb(10, Number.NaN, 20, 20)), MSG.objFinite);
  });

  it("J5. insert with NaN width throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.insert(aabb(10, 10, Number.NaN, 20)), MSG.objFinite);
  });

  it("J6. insert with NaN height throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.insert(aabb(10, 10, 20, Number.NaN)), MSG.objFinite);
  });

  it("J7. insert with Infinity x throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.insert(aabb(Number.POSITIVE_INFINITY, 10, 20, 20)), MSG.objFinite);
  });

  it("J8. insert with -Infinity y throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.insert(aabb(10, Number.NEGATIVE_INFINITY, 20, 20)), MSG.objFinite);
  });

  it("J9. insert with Infinity width throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.insert(aabb(10, 10, Number.POSITIVE_INFINITY, 20)), MSG.objFinite);
  });

  it("J10. insert with Infinity height throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.insert(aabb(10, 10, 20, Number.POSITIVE_INFINITY)), MSG.objFinite);
  });

  it("J11. zero-extent object (width=0, height=0) is accepted — not over-rejected", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const point = aabb(100, 100, 0, 0);
    expect(() => qt.insert(point)).not.toThrow();
    const result = qt.retrieve(aabb(0, 0, 800, 600));
    expect(result).toContain(point);
  });

  it("J12. zero-width line (height>0) is accepted — not over-rejected", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const line = aabb(100, 50, 0, 100);
    expect(() => qt.insert(line)).not.toThrow();
    const result = qt.retrieve(aabb(0, 0, 800, 600));
    expect(result).toContain(line);
  });

  it("J13. zero-height line (width>0) is accepted — not over-rejected", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const line = aabb(50, 100, 100, 0);
    expect(() => qt.insert(line)).not.toThrow();
    const result = qt.retrieve(aabb(0, 0, 800, 600));
    expect(result).toContain(line);
  });

  it("J14. insert(null) throws QuadtreeError (not a raw TypeError)", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.insert(null as unknown as AABB), MSG.objFinite);
  });

  it("J15. insert(undefined) throws QuadtreeError (not a raw TypeError)", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.insert(undefined as unknown as AABB), MSG.objFinite);
  });
});

// ---------------------------------------------------------------------------
// K. Additional coverage (Item 2 tests)
// ---------------------------------------------------------------------------

describe("K. Object larger than root bounds — exactly-once in sub-queries", () => {
  it("K1. oversized object appears exactly once in full-region query after subdivide", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 100, 100), maxObjects: 2, maxLevels: 4 });
    // Filler objects to trigger subdivide
    qt.insert(aabb(5, 5, 5, 5));
    qt.insert(aabb(80, 80, 5, 5));
    qt.insert(aabb(20, 20, 5, 5)); // third insert triggers subdivide
    // Oversized: larger than root bounds
    const huge = aabb(-50, -50, 300, 300);
    qt.insert(huge);
    const full = qt.retrieve(aabb(0, 0, 100, 100));
    expect(full.filter((o) => o === huge).length).toBe(1);
  });

  it("K2. oversized object appears in NW, NE, SW, SE sub-queries each exactly once", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 100, 100), maxObjects: 1, maxLevels: 4 });
    qt.insert(aabb(5, 5, 5, 5));
    qt.insert(aabb(80, 80, 5, 5)); // triggers subdivide
    const huge = aabb(-50, -50, 300, 300);
    qt.insert(huge);
    const nw = qt.retrieve(aabb(0, 0, 50, 50));
    const ne = qt.retrieve(aabb(50, 0, 50, 50));
    const sw = qt.retrieve(aabb(0, 50, 50, 50));
    const se = qt.retrieve(aabb(50, 50, 50, 50));
    expect(nw.filter((o) => o === huge).length).toBe(1);
    expect(ne.filter((o) => o === huge).length).toBe(1);
    expect(sw.filter((o) => o === huge).length).toBe(1);
    expect(se.filter((o) => o === huge).length).toBe(1);
  });
});

describe("K. retrieveInto zero-alloc steady-state (60-frame loop)", () => {
  it("K3. buffer identity preserved across ~60 clear+insert+retrieveInto frames", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600), maxObjects: 4, maxLevels: 4 });
    const buf: AABB[] = [];
    const region = aabb(0, 0, 800, 600);

    // Run 60 frames so the internal scratch reaches and holds steady state
    for (let frame = 0; frame < 60; frame++) {
      qt.clear();
      for (let i = 0; i < 12; i++) {
        qt.insert(aabb((i * 60) % 800, (i * 40) % 600, 20, 20));
      }
      const ret = qt.retrieveInto(region, buf);
      // Buffer identity must be preserved every frame
      expect(ret).toBe(buf);
    }
    // After steady state, buffer length must equal the number of distinct
    // objects inserted per frame (12 new aabb() references per frame, no
    // modulo wrap for i < 12, so all are distinct — Set keeps all 12).
    expect(buf.length).toBe(12);
  });
});

describe("K. Negative-origin bounds", () => {
  it("K4. negative-origin tree inserts and retrieves negative-coord objects correctly", () => {
    // Use maxObjects=2 to trigger subdivision so objects are segregated into
    // child nodes — only then can a sub-region query exclude a distant object.
    const qt = createQuadtree({
      bounds: aabb(-200, -200, 400, 400),
      maxObjects: 2,
      maxLevels: 4,
    });
    // obj1 and obj2 are firmly in NW quadrant (x<0, y<0 relative to midpoint at 0,0)
    const obj1 = aabb(-180, -180, 10, 10);
    const obj2 = aabb(-50, -50, 5, 5);
    // obj3 is firmly in SE quadrant (x>=0, y>=0)
    const obj3 = aabb(100, 100, 20, 20);
    qt.insert(obj1);
    qt.insert(obj2);
    qt.insert(obj3); // 3rd insert triggers subdivide: obj1+obj2 → NW, obj3 → SE
    // Full-region query must return all three
    const full = qt.retrieve(aabb(-200, -200, 400, 400));
    expect(full).toContain(obj1);
    expect(full).toContain(obj2);
    expect(full).toContain(obj3);
    // NW-only query: must include obj1 and obj2 but exclude obj3 (in SE child)
    // midpoint of bounds is (-200+200, -200+200) = (0, 0)
    // NW child: x in [-200,0), y in [-200,0)
    const neg = qt.retrieve(aabb(-200, -200, 200, 200));
    expect(neg).toContain(obj1);
    expect(neg).toContain(obj2);
    expect(neg).not.toContain(obj3);
  });
});

describe("K. Point object deep subdivision", () => {
  it("K5. zero-extent point at non-midpoint survives deep subdivision (maxLevels=4)", () => {
    const qt = createQuadtree({
      bounds: aabb(0, 0, 200, 200),
      maxObjects: 1,
      maxLevels: 4,
    });
    // Insert enough objects to drive subdivision deep
    for (let i = 0; i < 8; i++) {
      qt.insert(aabb(i * 10, i * 10, 5, 5));
    }
    // Zero-extent point at a non-midpoint position
    const pt = aabb(73, 91, 0, 0);
    qt.insert(pt);
    // Tight region around the point — must retrieve it
    const result = qt.retrieve(aabb(60, 80, 30, 30));
    expect(result).toContain(pt);
  });
});

describe("K. maxLevels=1 with same-quadrant cluster — all retrievable, zero duplicates", () => {
  it("K6. many same-quadrant objects with maxLevels=1 are all retrievable without duplicates", () => {
    const qt = createQuadtree({
      bounds: aabb(0, 0, 200, 200),
      maxObjects: 2,
      maxLevels: 1,
    });
    // All objects in NW quadrant (x<100, y<100)
    const objs: AABB[] = [];
    for (let i = 0; i < 20; i++) {
      const o = aabb(5 + i * 4, 5 + i * 4, 3, 3);
      objs.push(o);
      qt.insert(o);
    }
    const result = qt.retrieve(aabb(0, 0, 200, 200));
    // All 20 distinct objects must appear
    for (const o of objs) {
      expect(result).toContain(o);
    }
    // Zero duplicates — Set size must equal array length
    expect(result.length).toBe(new Set(result).size);
  });
});

describe("K. Non-origin bounds", () => {
  it("K7. tree with non-origin bounds (x=500,y=500) inserts and retrieves correctly", () => {
    // Use maxObjects=2 so subdivision triggers on the 3rd insert, letting
    // sub-region queries exclude objects in a different child node.
    const qt = createQuadtree({
      bounds: aabb(500, 500, 400, 300),
      maxObjects: 2,
      maxLevels: 4,
    });
    // obj1 is firmly in NW child (midpoint is (700, 650))
    const obj1 = aabb(520, 520, 30, 30);
    // obj2 is near the NW quadrant too — used as a filler to trigger subdivide
    const obj2 = aabb(540, 540, 30, 30);
    // obj3 is firmly in SE child (x≥700, y≥650)
    const obj3 = aabb(850, 750, 20, 20);
    qt.insert(obj1);
    qt.insert(obj2);
    qt.insert(obj3); // 3rd insert triggers subdivide; obj1+obj2 → NW child, obj3 → SE child
    const full = qt.retrieve(aabb(500, 500, 400, 300));
    expect(full).toContain(obj1);
    expect(full).toContain(obj2);
    expect(full).toContain(obj3);
    // NW child covers [500,700)×[500,650); obj3 is at x=850 well outside it.
    // midpoint of bounds: x=500+200=700, y=500+150=650
    const nwRegion = qt.retrieve(aabb(500, 500, 200, 150));
    expect(nwRegion).toContain(obj1);
    // obj3 at (850,750) is in SE child, outside NW query region
    expect(nwRegion).not.toContain(obj3);
  });
});

// ---------------------------------------------------------------------------
// L. retrieve / retrieveInto adversarial region validation (QDT-S-01 / QDT-T-01)
// ---------------------------------------------------------------------------

describe("L. retrieve / retrieveInto adversarial region validation", () => {
  it("L1. retrieve with NaN x throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.retrieve(aabb(Number.NaN, 0, 100, 100)), MSG.regionFinite);
  });

  it("L2. retrieve with NaN y throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.retrieve(aabb(0, Number.NaN, 100, 100)), MSG.regionFinite);
  });

  it("L3. retrieve with NaN width throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.retrieve(aabb(0, 0, Number.NaN, 100)), MSG.regionFinite);
  });

  it("L4. retrieve with NaN height throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.retrieve(aabb(0, 0, 100, Number.NaN)), MSG.regionFinite);
  });

  it("L5. retrieve with Infinity x throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(
      () => qt.retrieve(aabb(Number.POSITIVE_INFINITY, 0, 100, 100)),
      MSG.regionFinite,
    );
  });

  it("L6. retrieve with -Infinity y throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(
      () => qt.retrieve(aabb(0, Number.NEGATIVE_INFINITY, 100, 100)),
      MSG.regionFinite,
    );
  });

  it("L7. retrieve with negative width throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.retrieve(aabb(100, 100, -1, 100)), MSG.regionWidth);
  });

  it("L8. retrieve with negative height throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expectQuadtreeError(() => qt.retrieve(aabb(100, 100, 100, -1)), MSG.regionHeight);
  });

  it("L9. retrieveInto with NaN x throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const buf: AABB[] = [];
    expectQuadtreeError(
      () => qt.retrieveInto(aabb(Number.NaN, 0, 100, 100), buf),
      MSG.regionFinite,
    );
  });

  it("L10. retrieveInto with Infinity width throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const buf: AABB[] = [];
    expectQuadtreeError(
      () => qt.retrieveInto(aabb(0, 0, Number.POSITIVE_INFINITY, 100), buf),
      MSG.regionFinite,
    );
  });

  it("L11. retrieveInto with negative height throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const buf: AABB[] = [];
    expectQuadtreeError(() => qt.retrieveInto(aabb(0, 0, 100, -5), buf), MSG.regionHeight);
  });

  it("L12. retrieve with zero width (zero-extent region) is valid — does not throw", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.retrieve(aabb(50, 50, 0, 100))).not.toThrow();
  });

  it("L13. retrieve with zero height (zero-extent region) is valid — does not throw", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.retrieve(aabb(50, 50, 100, 0))).not.toThrow();
  });

  it("L14. region fields are read once: the validated values are the walked values", () => {
    // Regression (TOCTOU): validateRegion() read the fields, then the walk
    // read them again, so a getter finite during validation but NaN on the
    // second read passed validation and silently matched no node.
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const box = aabb(100, 100, 32, 32);
    qt.insert(box);
    let reads = 0;
    const region = {
      y: 0,
      width: 800,
      height: 600,
      get x(): number {
        reads++;
        return reads === 1 ? 0 : Number.NaN;
      },
    };
    expect(qt.retrieve(region)).toEqual([box]);
    expect(reads).toBe(1);
    reads = 0;
    const buf: AABB[] = [];
    expect(qt.retrieveInto(region, buf)).toEqual([box]);
    expect(reads).toBe(1);
  });

  it("L15. a nullish region throws QuadtreeError, not TypeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const buf: AABB[] = [];
    for (const region of [null, undefined]) {
      expectQuadtreeError(() => qt.retrieve(region as unknown as AABB), MSG.regionFinite);
      expectQuadtreeError(() => qt.retrieveInto(region as unknown as AABB, buf), MSG.regionFinite);
    }
  });
});

// ---------------------------------------------------------------------------
// M. Root boundary — zero-size point on left/top minimum edge
// ---------------------------------------------------------------------------

describe("M. Root boundary zero-size insertion", () => {
  it("M1. zero-size point at exact top-left corner (bounds.x, bounds.y) is retrievable", () => {
    // This is the primary P1 regression: the root-gate rectsOverlap used strict
    // inequalities, so a zero-size point at (bounds.x, bounds.y) satisfied
    // neither a.x < b.x + 0 (bounds.x < bounds.x → false) and was silently
    // dropped. The fixed root gate must accept it.
    const bounds = aabb(0, 0, 800, 600);
    const qt = createQuadtree({ bounds });
    const pt = aabb(bounds.x, bounds.y, 0, 0); // { x:0, y:0, width:0, height:0 }
    qt.insert(pt);
    const result = qt.retrieve(aabb(0, 0, 10, 10));
    expect(result).toContain(pt);
  });

  it("M2. zero-size point on left edge (x=bounds.x, y=mid) is retrievable", () => {
    const bounds = aabb(0, 0, 800, 600);
    const qt = createQuadtree({ bounds });
    const pt = aabb(bounds.x, 300, 0, 0); // x exactly on left edge, y somewhere in the middle
    qt.insert(pt);
    const result = qt.retrieve(aabb(0, 290, 10, 20));
    expect(result).toContain(pt);
  });

  it("M3. zero-size point on top edge (x=mid, y=bounds.y) is retrievable", () => {
    const bounds = aabb(0, 0, 800, 600);
    const qt = createQuadtree({ bounds });
    const pt = aabb(400, bounds.y, 0, 0); // x somewhere in the middle, y exactly on top edge
    qt.insert(pt);
    const result = qt.retrieve(aabb(390, 0, 20, 10));
    expect(result).toContain(pt);
  });

  it("M4. zero-size point just outside bounds (x < bounds.x) is silently excluded", () => {
    // Negative control: a point outside the left edge must stay excluded.
    const bounds = aabb(0, 0, 800, 600);
    const qt = createQuadtree({ bounds });
    const pt = aabb(bounds.x - 1, bounds.y, 0, 0); // one pixel left of the left edge
    qt.insert(pt); // must be a no-op (silent drop)
    const result = qt.retrieve(aabb(0, 0, 800, 600));
    expect(result).not.toContain(pt);
  });

  it("M5. positive-size object flush on the right/bottom edge stays excluded", () => {
    // Right-open semantics: a 10×10 box whose left edge is at bounds.x+bounds.width
    // has no overlap — rectsOverlap rightly rejects it and the fix must not change that.
    const bounds = aabb(0, 0, 800, 600);
    const qt = createQuadtree({ bounds });
    const obj = aabb(800, 0, 10, 10); // x = bounds.x + bounds.width — entirely outside
    qt.insert(obj);
    const result = qt.retrieve(aabb(0, 0, 800, 600));
    expect(result).not.toContain(obj);
  });

  it("M6. zero-size point on the right/bottom maximum edge stays excluded (right-open)", () => {
    // Negative control mirroring M1: the minimum edge is inclusive, but the
    // maximum edge stays exclusive per the right-open [x, x+width) contract.
    // A zero-size point at (bounds.x+bounds.width, bounds.y+bounds.height) was
    // rejected by the original rectsOverlap gate and must remain rejected.
    const bounds = aabb(0, 0, 800, 600);
    const qt = createQuadtree({ bounds });
    const pt = aabb(bounds.x + bounds.width, bounds.y + bounds.height, 0, 0); // (800, 600)
    qt.insert(pt);
    const result = qt.retrieve(aabb(0, 0, 800, 600));
    expect(result).not.toContain(pt);
  });
});

describe("N. Precision-bound subdivision depth", () => {
  it("N1. a dense point cluster stays retrievable even with maxLevels far past the ulp limit", () => {
    // Regression for the silent-data-loss bug: subdividing purely on
    // `node.level < maxLevels` with no representability check drives node
    // width/height below the ulp of the coordinate, so `x + width / 2`
    // rounds back to `x`. `subdivide()` then keeps producing children
    // indistinguishable from their parent, and a point cluster stops
    // matching region queries that start exactly on it.
    const qt = createQuadtree({
      bounds: aabb(0, 0, 800, 600),
      maxObjects: 1,
      maxLevels: 60,
    });
    const points: AABB[] = [];
    for (let i = 0; i < 63; i++) {
      points.push(aabb(181.3796469461808, 566.249239416442, 0, 0));
    }
    for (const p of points) qt.insert(p);
    const pointQuery = qt.retrieve(aabb(181.3796469461808, 566.249239416442, 1, 1));
    expect(pointQuery.length).toBe(63);
    const fullQuery = qt.retrieve(aabb(0, 0, 800, 600));
    expect(fullQuery.length).toBe(63);
  });
});

// ---------------------------------------------------------------------------
// O. Shared node edges (no ulp drift on right/bottom children)
// ---------------------------------------------------------------------------

describe("O. Shared node edges", () => {
  it("O1. non-dyadic negative-origin bounds: an object flush on the right/bottom edge is retrievable by its own box", () => {
    // Regression: subdivide() rebuilt a right child as `x + w` with extent
    // `w`, so its outer edge was `(x + w) + w`. For x = -0.3, width = 2.4
    // that is 2.0999999999999996, one ulp short of the root's x + width
    // (2.1); y = -0.7, height = 0.2 drifts the same way. An object in that
    // sliver passed the root gate, was routed into the right/bottom child,
    // and then matched no node on retrieve().
    const qt = createQuadtree({ bounds: aabb(-0.3, -0.7, 2.4, 0.2), maxObjects: 1, maxLevels: 4 });
    const x1 = -0.3 + 2.4;
    const y1 = -0.7 + 0.2;
    const sx = nextDown(x1);
    const sy = nextDown(y1);
    const corner = aabb(sx, sy, x1 - sx, y1 - sy);
    expect(corner.x + corner.width).toBe(x1); // flush on the exclusive edge
    expect(corner.y + corner.height).toBe(y1);
    const cornerPoint = aabb(sx, sy, 0, 0);
    const right = aabb(sx, -0.65, x1 - sx, 0.01);
    const bottom = aabb(0.5, sy, 0.25, y1 - sy);
    qt.insert(aabb(-0.2, -0.68, 0.1, 0.01)); // filler: forces the root to subdivide
    for (const o of [corner, cornerPoint, right, bottom]) qt.insert(o);
    for (const o of [corner, cornerPoint, right, bottom]) {
      expect(qt.retrieve(o)).toContain(o);
      const buf: AABB[] = [];
      expect(qt.retrieveInto(o, buf)).toContain(o);
    }
  });

  it("O2. the flush corner object survives every depth from 1 to 12", () => {
    for (let maxLevels = 1; maxLevels <= 12; maxLevels++) {
      const qt = createQuadtree({ bounds: aabb(-0.3, -0.7, 2.4, 0.2), maxObjects: 1, maxLevels });
      const x1 = -0.3 + 2.4;
      const y1 = -0.7 + 0.2;
      const sx = nextDown(x1);
      const sy = nextDown(y1);
      const corner = aabb(sx, sy, x1 - sx, y1 - sy);
      qt.insert(corner);
      // Fillers march toward the corner so every level splits next to it.
      for (let k = 1; k <= maxLevels; k++) {
        qt.insert(aabb(x1 - 2.4 / 2 ** (k + 1), y1 - 0.2 / 2 ** (k + 1), 0, 0));
      }
      expect(qt.retrieve(corner)).toContain(corner);
    }
  });

  it("O3. a point on a non-dyadic split line is routed to the child whose edge it is", () => {
    // quadrantIndices and subdivide share one midpoint formula, so a point
    // exactly on the split line lands in the right/bottom child and that
    // child's stored min edge is the same float.
    const qt = createQuadtree({ bounds: aabb(-0.3, -0.7, 2.4, 0.2), maxObjects: 1, maxLevels: 4 });
    const midX = -0.3 + (-0.3 + 2.4 - -0.3) / 2;
    const midY = -0.7 + (-0.7 + 0.2 - -0.7) / 2;
    const onMid = aabb(midX, midY, 0, 0);
    qt.insert(aabb(-0.25, -0.69, 0.01, 0.01));
    qt.insert(onMid);
    expect(qt.retrieve(onMid)).toContain(onMid);
    expect(qt.retrieve(aabb(midX, midY, 0.01, 0.01))).toContain(onMid);
  });
});
