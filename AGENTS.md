# Sage.js contributor notes

- Use `pnpm`, not `npm`; keep `pnpm-lock.yaml` and do not add `package-lock.json`.
- Support Node.js 22.22.2 or newer.
- Keep Sage mode mathematics-friendly without changing Python mode accidentally.
- Add focused regression tests and run the relevant build/test suites before committing.
- Commit coherent completed work and push each commit to GitHub promptly.
- Do not commit `*.chat` files or generated build artifacts that are already ignored.
