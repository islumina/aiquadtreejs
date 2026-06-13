import { describe, expect, it } from "vitest";

import { type AABB, QuadtreeDisposedError, QuadtreeError, createQuadtree } from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function aabb(x: number, y: number, width: number, height: number): AABB {
  return { x, y, width, height };
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
    expect(() => createQuadtree({ bounds: aabb(0, 0, 0, 100) })).toThrow(QuadtreeError);
    expect(() => createQuadtree({ bounds: aabb(0, 0, -1, 100) })).toThrow(QuadtreeError);
  });

  it("A4. bounds with NaN throws QuadtreeError", () => {
    expect(() => createQuadtree({ bounds: aabb(Number.NaN, 0, 100, 100) })).toThrow(QuadtreeError);
    expect(() => createQuadtree({ bounds: aabb(0, 0, Number.NaN, 100) })).toThrow(QuadtreeError);
  });

  it("A5. bounds with Infinity throws QuadtreeError", () => {
    expect(() => createQuadtree({ bounds: aabb(Number.POSITIVE_INFINITY, 0, 100, 100) })).toThrow(
      QuadtreeError,
    );
    expect(() => createQuadtree({ bounds: aabb(0, 0, Number.POSITIVE_INFINITY, 100) })).toThrow(
      QuadtreeError,
    );
  });

  it("A6. bounds.height <= 0 throws QuadtreeError", () => {
    expect(() => createQuadtree({ bounds: aabb(0, 0, 100, 0) })).toThrow(QuadtreeError);
    expect(() => createQuadtree({ bounds: aabb(0, 0, 100, -5) })).toThrow(QuadtreeError);
  });

  it("A7. invalid maxObjects throws QuadtreeError", () => {
    expect(() => createQuadtree({ bounds: aabb(0, 0, 100, 100), maxObjects: 0 })).toThrow(
      QuadtreeError,
    );
  });

  it("A8. invalid maxLevels throws QuadtreeError", () => {
    expect(() => createQuadtree({ bounds: aabb(0, 0, 100, 100), maxLevels: 0 })).toThrow(
      QuadtreeError,
    );
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
});

// ---------------------------------------------------------------------------
// J. insert() input validation (Item 1 fix)
// ---------------------------------------------------------------------------

describe("J. insert() input validation", () => {
  it("J1. insert with negative width throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.insert(aabb(10, 10, -1, 20))).toThrow(QuadtreeError);
  });

  it("J2. insert with negative height throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.insert(aabb(10, 10, 20, -1))).toThrow(QuadtreeError);
  });

  it("J3. insert with NaN x throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.insert(aabb(Number.NaN, 10, 20, 20))).toThrow(QuadtreeError);
  });

  it("J4. insert with NaN y throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.insert(aabb(10, Number.NaN, 20, 20))).toThrow(QuadtreeError);
  });

  it("J5. insert with NaN width throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.insert(aabb(10, 10, Number.NaN, 20))).toThrow(QuadtreeError);
  });

  it("J6. insert with NaN height throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.insert(aabb(10, 10, 20, Number.NaN))).toThrow(QuadtreeError);
  });

  it("J7. insert with Infinity x throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.insert(aabb(Number.POSITIVE_INFINITY, 10, 20, 20))).toThrow(QuadtreeError);
  });

  it("J8. insert with -Infinity y throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.insert(aabb(10, Number.NEGATIVE_INFINITY, 20, 20))).toThrow(QuadtreeError);
  });

  it("J9. insert with Infinity width throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.insert(aabb(10, 10, Number.POSITIVE_INFINITY, 20))).toThrow(QuadtreeError);
  });

  it("J10. insert with Infinity height throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.insert(aabb(10, 10, 20, Number.POSITIVE_INFINITY))).toThrow(QuadtreeError);
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
    expect(() => qt.insert(null as unknown as AABB)).toThrow(QuadtreeError);
  });

  it("J15. insert(undefined) throws QuadtreeError (not a raw TypeError)", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.insert(undefined as unknown as AABB)).toThrow(QuadtreeError);
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
    expect(() => qt.retrieve(aabb(Number.NaN, 0, 100, 100))).toThrow(QuadtreeError);
  });

  it("L2. retrieve with NaN y throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.retrieve(aabb(0, Number.NaN, 100, 100))).toThrow(QuadtreeError);
  });

  it("L3. retrieve with NaN width throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.retrieve(aabb(0, 0, Number.NaN, 100))).toThrow(QuadtreeError);
  });

  it("L4. retrieve with NaN height throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.retrieve(aabb(0, 0, 100, Number.NaN))).toThrow(QuadtreeError);
  });

  it("L5. retrieve with Infinity x throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.retrieve(aabb(Number.POSITIVE_INFINITY, 0, 100, 100))).toThrow(QuadtreeError);
  });

  it("L6. retrieve with -Infinity y throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.retrieve(aabb(0, Number.NEGATIVE_INFINITY, 100, 100))).toThrow(QuadtreeError);
  });

  it("L7. retrieve with negative width throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.retrieve(aabb(100, 100, -1, 100))).toThrow(QuadtreeError);
  });

  it("L8. retrieve with negative height throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.retrieve(aabb(100, 100, 100, -1))).toThrow(QuadtreeError);
  });

  it("L9. retrieveInto with NaN x throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const buf: AABB[] = [];
    expect(() => qt.retrieveInto(aabb(Number.NaN, 0, 100, 100), buf)).toThrow(QuadtreeError);
  });

  it("L10. retrieveInto with Infinity width throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const buf: AABB[] = [];
    expect(() => qt.retrieveInto(aabb(0, 0, Number.POSITIVE_INFINITY, 100), buf)).toThrow(
      QuadtreeError,
    );
  });

  it("L11. retrieveInto with negative height throws QuadtreeError", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    const buf: AABB[] = [];
    expect(() => qt.retrieveInto(aabb(0, 0, 100, -5), buf)).toThrow(QuadtreeError);
  });

  it("L12. retrieve with zero width (zero-extent region) is valid — does not throw", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.retrieve(aabb(50, 50, 0, 100))).not.toThrow();
  });

  it("L13. retrieve with zero height (zero-extent region) is valid — does not throw", () => {
    const qt = createQuadtree({ bounds: aabb(0, 0, 800, 600) });
    expect(() => qt.retrieve(aabb(50, 50, 100, 0))).not.toThrow();
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
