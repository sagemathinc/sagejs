# Sage.js contributor notes

- Use `pnpm`, not `npm`; keep `pnpm-lock.yaml` and do not add `package-lock.json`.
- Support Node.js 22.22.2 or newer.
- Keep Sage mode mathematics-friendly without changing Python mode accidentally.
- Target Sage-compatible semantics by default; document and test any intentional
  incompatibility instead of silently inventing different behavior.
- Add focused regression tests and run the relevant build/test suites before committing.
- Keep mathematical library `.py` files ordinary CPython-parseable source.
  Add fully migrated modules to `pyrightconfig.json` and keep
  `pnpm test:baselib:strict` at zero errors.
- Use `sagejs.runtime` for explicit low-level boundaries; do not add verbatim
  JavaScript or `# globals` declarations to strict mathematical modules.
- Commit coherent completed work and push each commit to GitHub promptly.
- Do not commit `*.chat` files or generated build artifacts that are already ignored.
