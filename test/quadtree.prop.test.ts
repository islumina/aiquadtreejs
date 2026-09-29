import * as fc from "fast-check";
import { describe, it } from "vitest";

import { type AABB, createQuadtree } from "../src/index.js";
import { nextDown } from "./float.js";

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

// ---------------------------------------------------------------------------
// Broadphase completeness oracle: float bounds, negative origins
// ---------------------------------------------------------------------------

// fc.double draws evenly over representable doubles, so on its own it
// yields mostly tiny or extreme values (a root extent under 1e-6 is usually
// absorbed by its origin). Mixing in decimal-looking values such as -0.3 or
// 2.4 spreads coordinates across the range and hits the non-dyadic sums
// where float edges drift.
const decimalArb = (min: number, max: number) =>
  fc.integer({ min: Math.ceil(min * 1000), max: Math.floor(max * 1000) }).map((n) => n / 1000);

const floatArb = (min: number, max: number) =>
  fc.oneof(
    { weight: 1, arbitrary: fc.double({ noNaN: true, noDefaultInfinity: true, min, max }) },
    { weight: 3, arbitrary: decimalArb(min, max) },
  );

// Root bounds: non-integer float origin in [-1e4, 1e4], extent in (0, 1e4].
const originArb = floatArb(-1e4, 1e4);
const extentArb = fc.oneof(
  {
    weight: 1,
    arbitrary: fc.double({
      noNaN: true,
      noDefaultInfinity: true,
      min: 0,
      minExcluded: true,
      max: 1e4,
    }),
  },
  { weight: 3, arbitrary: decimalArb(0.001, 1e4) },
);

// One axis of a box, relative to the root so every coordinate is a float
// derived from float bounds. "free": start anywhere in [-0.25, 1.25] of the
// root extent (partly or fully outside is fine) with a span of 0 or up to
// `maxSpan` of the extent. "edge": start one ulp below the root's exclusive
// max edge, as a point or as a sliver that ends exactly on that edge; this
// is where right/bottom children used to drift.
type AxisSpec = { edge: false; at: number; span: number } | { edge: true; sliver: boolean };

const axisArb = (maxSpan: number): fc.Arbitrary<AxisSpec> =>
  fc.oneof(
    {
      weight: 4,
      arbitrary: fc.record({
        edge: fc.constant(false as const),
        at: floatArb(-0.25, 1.25),
        span: fc.oneof(
          { weight: 1, arbitrary: fc.constant(0) },
          { weight: 3, arbitrary: floatArb(0, maxSpan) },
        ),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({ edge: fc.constant(true as const), sliver: fc.boolean() }),
    },
  );

const boxSpecArb = (maxSpan: number) => fc.record({ x: axisArb(maxSpan), y: axisArb(maxSpan) });
type BoxSpec = { x: AxisSpec; y: AxisSpec };

// Returns [start, extent] on one axis. `end` is computed as `start + extent`
// exactly as the tree computes `bounds.x + bounds.width`.
function place(start: number, extent: number, s: AxisSpec): [number, number] {
  const end = start + extent;
  if (s.edge) {
    const at = nextDown(end);
    return [at, s.sliver ? end - at : 0];
  }
  return [start + s.at * extent, s.span * extent];
}

function toBox(root: AABB, spec: BoxSpec): AABB {
  const [x, width] = place(root.x, root.width, spec.x);
  const [y, height] = place(root.y, root.height, spec.y);
  return { x, y, width, height };
}

// Do object `a`, region `b` and the root span [lo, hi) share a point on one
// axis? A zero extent is the point {start}; a positive extent is the
// right-open span [start, start + extent), using the same float sums the
// tree uses.
function axisShared(
  a0: number,
  aw: number,
  b0: number,
  bw: number,
  lo: number,
  hi: number,
): boolean {
  if (aw === 0 && bw === 0) return a0 === b0 && lo <= a0 && a0 < hi;
  if (aw === 0) return lo <= a0 && a0 < hi && b0 <= a0 && a0 < b0 + bw;
  if (bw === 0) return lo <= b0 && b0 < hi && a0 <= b0 && b0 < a0 + aw;
  return Math.max(lo, a0, b0) < Math.min(hi, a0 + aw, b0 + bw);
}

// Brute-force oracle: an object must be returned when it overlaps the
// region inside the root. Objects are indexed only by their part inside the
// root, so an object that meets the region only outside the root is not
// promised (the broadphase may still return it).
function mustReturn(root: AABB, o: AABB, r: AABB): boolean {
  return (
    axisShared(o.x, o.width, r.x, r.width, root.x, root.x + root.width) &&
    axisShared(o.y, o.height, r.y, r.height, root.y, root.y + root.height)
  );
}

// Small boxes span at most 1/64 of the root so maxObjects = 1 at depth 12
// cannot blow up the node count. Up to maxObjects - 1 large boxes (spanning
// up to the whole root) never force a split on their own, for the same reason.
const scenarioArb = fc
  .record({
    root: fc.record({ x: originArb, y: originArb, width: extentArb, height: extentArb }),
    maxObjects: fc.integer({ min: 1, max: 8 }),
    maxLevels: fc.integer({ min: 1, max: 12 }),
  })
  .chain((cfg) =>
    fc.record({
      cfg: fc.constant(cfg),
      large: fc.array(boxSpecArb(1), { maxLength: cfg.maxObjects - 1 }),
      small: fc.array(boxSpecArb(1 / 64), {
        maxLength: 200 - (cfg.maxObjects - 1),
        size: "max",
      }),
      region: boxSpecArb(1.5),
      // When set, query with one inserted object's own box instead.
      own: fc.option(fc.nat(), { freq: 2 }),
    }),
  );

type Scenario = {
  cfg: { root: AABB; maxObjects: number; maxLevels: number };
  large: BoxSpec[];
  small: BoxSpec[];
  region: BoxSpec;
  own: number | null;
};

function build(scn: Scenario) {
  const { root, maxObjects, maxLevels } = scn.cfg;
  const qt = createQuadtree<AABB>({ bounds: root, maxObjects, maxLevels });
  const objs = [...scn.large, ...scn.small].map((spec) => toBox(root, spec));
  for (const o of objs) qt.insert(o);
  const picked = scn.own === null || objs.length === 0 ? undefined : objs[scn.own % objs.length];
  const region = picked ?? toBox(root, scn.region);
  const expected = objs.filter((o) => mustReturn(root, o, region));
  return { qt, region, expected };
}

describe("property: broadphase completeness", () => {
  it("prop5. retrieve returns every object that overlaps the region inside the root", () => {
    fc.assert(
      fc.property(scenarioArb, (scn) => {
        const { qt, region, expected } = build(scn);
        const got = new Set(qt.retrieve(region));
        return expected.every((o) => got.has(o));
      }),
      { numRuns: 100 },
    );
  });

  it("prop6. retrieveInto returns every object that overlaps the region inside the root", () => {
    fc.assert(
      fc.property(scenarioArb, (scn) => {
        const { qt, region, expected } = build(scn);
        const stale: AABB = { x: 0, y: 0, width: 0, height: 0 };
        const buf: AABB[] = [stale, stale];
        const ret = qt.retrieveInto(region, buf);
        const got = new Set(buf);
        return ret === buf && !got.has(stale) && expected.every((o) => got.has(o));
      }),
      { numRuns: 100 },
    );
  });
});
