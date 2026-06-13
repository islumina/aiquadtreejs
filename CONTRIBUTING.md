# Contributing to aiquadtreejs

Keep the tree small, allocation-aware, and explicit about broadphase semantics.

## Local workflow

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm verify:docs
pnpm build:llms
pnpm verify:llms
pnpm check:size
```

Run `pnpm lint` before PRs. If docs change, regenerate `llms-full.txt`.

## Rules

- Preserve right-open coordinate semantics.
- Add tests for root edges, quadrant boundaries, zero-size objects, `retrieveInto()`, `clear()`, and dispose.
- Do not turn broadphase results into precise collision promises.
- Keep allocation behavior visible in docs and tests.

## License

MIT
