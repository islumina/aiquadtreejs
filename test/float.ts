// Largest double strictly below a finite `v`: the last representable
// coordinate inside a right-open `[x, x1)` span. Used to build objects that
// sit flush against a node's exclusive right/bottom edge.
export function nextDown(v: number): number {
  if (v === 0) return -Number.MIN_VALUE;
  const f = new Float64Array([v]);
  const bits = new BigInt64Array(f.buffer);
  bits[0] = (bits[0] as bigint) + (v > 0 ? -1n : 1n);
  return f[0] as number;
}
