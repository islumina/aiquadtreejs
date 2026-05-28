// Scaffold-stage placeholder test. Asserts that the public surface compiles
// and is shaped correctly so vitest can run against a non-empty test set
// while the implementation is still a `throw` stub. Real tests land in 0.1.0.

import { describe, expect, it } from "vitest";

import {
  type AABB,
  type Quadtree,
  QuadtreeDisposedError,
  QuadtreeError,
  type QuadtreeOptions,
  createQuadtree,
} from "../src/index.js";

describe("aiquadtreejs scaffold", () => {
  it("exports a callable createQuadtree factory", () => {
    expect(typeof createQuadtree).toBe("function");
  });

  it("exports QuadtreeError and QuadtreeDisposedError classes", () => {
    expect(new QuadtreeError("x")).toBeInstanceOf(Error);
    expect(new QuadtreeDisposedError("x")).toBeInstanceOf(Error);
    expect(new QuadtreeError("x").name).toBe("QuadtreeError");
    expect(new QuadtreeDisposedError("x").name).toBe("QuadtreeDisposedError");
  });

  it("createQuadtree throws the scaffold sentinel until 0.1.0", () => {
    const opts: QuadtreeOptions = {
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      maxObjects: 10,
      maxLevels: 4,
    };
    expect(() => createQuadtree<AABB>(opts)).toThrow(/not implemented/);
  });

  it("public Quadtree<T> shape compiles", () => {
    // Type-level assertion only: this code path is never executed.
    const _typeProbe = (q: Quadtree<AABB>): void => {
      void q.insert;
      void q.retrieve;
      void q.clear;
      void q.dispose;
      void q.disposed;
    };
    void _typeProbe;
  });
});
