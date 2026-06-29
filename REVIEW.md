# aiquadtreejs Review

Current review state after the 2026-06-10 ai*js pass.

## Current Known Issues / Backlog

| Priority | Area | Status | Notes |
| --- | --- | --- | --- |
| P3 | Unbounded `maxLevels` | Documented | High depths plus spanning objects can explode node counts. Current behavior leaves the cap to callers. |

## Fixed Summary

- Zero-size root boundary (fixed 0.5.8): `rootContains` now uses inclusive-minimum / exclusive-maximum (`[x, x+width)`) semantics for zero-size points, so a point exactly on the root `left/top` boundary is correctly accepted.
- `retrieve()` and `retrieveInto()` validate regions before traversal.
- `clear()` drains internal scratch buffers.
- Spanning object results are deduplicated.

## Verification Baseline

- `pnpm typecheck`
- `pnpm test`
- `pnpm verify:docs`
- `pnpm verify:exports`
- `pnpm verify:llms`
- `pnpm check:size`
