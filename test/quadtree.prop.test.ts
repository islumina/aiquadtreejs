import * as fc from "fast-check";
import { describe, it } from "vitest";

import { type AABB, createQuadtree } from "../src/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Body = AABB & { id: number };

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// AABB generator — finite numbers in [0, 1000], non-negative width/height
const aabbArb = fc.record({
  id: fc.integer({ min: 0, max: 10_000 }),
  x: fc.integer({ min: 0, max: 1000 }),
  y: fc.integer({ min: 0, max: 1000 }),
  width: fc.integer({ min: 0, max: 200 }),
  height: fc.integer({ min: 0, max: 200 }),
});

// Region generator — same shape, allows zero-size for boundary cases
const regionArb = fc.record({
  x: fc.integer({ min: -100, max: 1100 }),
  y: fc.integer({ min: -100, max: 1100 }),
  width: fc.integer({ min: 0, max: 1000 }),
  height: fc.integer({ min: 0, max: 1000 }),
});

// Zero-extent points biased toward subdivision midpoints. Exercises the G4
// regression: a point sitting exactly on midX / midY must not vanish after a
// node subdivides. Plain random boxes almost never land on a midpoint, so
// without this the property suite leaned entirely on deterministic G4 / I10.
const midpointArb = fc.record({
  id: fc.integer({ min: 0, max: 10_000 }),
  x: fc.constantFrom(125, 250, 375, 500, 625, 750, 875),
  y: fc.constantFrom(125, 250, 375, 500, 625, 750, 875),
  width: fc.constant(0),
  height: fc.constant(0),
});

// Body generator mixing ordinary boxes with midpoint points.
const bodyArb = fc.oneof(aabbArb, midpointArb);

// Bounds preset — fixed 1000×1000 root
const BOUNDS = { x: 0, y: 0, width: 1000, height: 1000 };

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("property: retrieve dedup invariant", () => {
  it("prop1. retrieve never returns duplicate references", () => {
    fc.assert(
      fc.property(fc.array(bodyArb, { maxLength: 100 }), regionArb, (objs, region) => {
        const qt = createQuadtree<Body>({ bounds: BOUNDS, maxObjects: 4, maxLevels: 4 });
        for (const o of objs) qt.insert(o);
        const result = qt.retrieve(region);
        // No reference appears twice
        return result.length === new Set(result).size;
      }),
      { numRuns: 100 },
    );
  });

  it("prop2. retrieve never returns duplicate ids", () => {
    fc.assert(
      // Unique ids by construction (no birthday-paradox collisions to skip),
      // so the id-uniqueness invariant is exercised on every run.
      fc.property(
        fc.uniqueArray(bodyArb, { selector: (o) => o.id, maxLength: 100 }),
        regionArb,
        (objs, region) => {
          const qt = createQuadtree<Body>({ bounds: BOUNDS, maxObjects: 4, maxLevels: 4 });
          for (const o of objs) qt.insert(o);
          const ids = qt.retrieve(region).map((o) => o.id);
          return ids.length === new Set(ids).size;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("property: retrieveInto invariants", () => {
  it("prop3. retrieveInto preserves target identity", () => {
    fc.assert(
      fc.property(fc.array(bodyArb, { maxLength: 100 }), regionArb, (objs, region) => {
        const qt = createQuadtree<Body>({ bounds: BOUNDS, maxObjects: 4, maxLevels: 4 });
        for (const o of objs) qt.insert(o);
        const buf: Body[] = [];
        const ret = qt.retrieveInto(region, buf);
        return ret === buf && buf.every((v) => v !== undefined);
      }),
      { numRuns: 100 },
    );
  });

  it("prop4. retrieveInto content equals retrieve content (as set)", () => {
    fc.assert(
      fc.property(fc.array(bodyArb, { maxLength: 100 }), regionArb, (objs, region) => {
        const qt = createQuadtree<Body>({ bounds: BOUNDS, maxObjects: 4, maxLevels: 4 });
        for (const o of objs) qt.insert(o);
        const buf: Body[] = [];
        qt.retrieveInto(region, buf);
        const arr = qt.retrieve(region);
        // Same length, same membership
        if (buf.length !== arr.length) return false;
        const bufSet = new Set(buf);
        for (const v of arr) if (!bufSet.has(v)) return false;
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
