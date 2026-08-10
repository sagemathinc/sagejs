# Sage.js contributor notes

> **Greenfield rule:** Sage.js currently has no external compatibility burden.
> Prefer correcting names, APIs, layouts, and representations directly instead
> of preserving accidental designs with aliases, migrations, or deprecation
> shims. Preserve Sage/Python semantics and documented external formats; this
> freedom ends when the project explicitly declares a stable compatibility
> contract.

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
- Treat native Windows x64 as a first-class target. New native dependencies
  must pass Windows CI or have an explicit capability flag with a tested correct
  fallback; do not make WSL, MSYS2, or MinGW part of the supported user path.
- Commit coherent completed work and push each commit to GitHub promptly.
- Do not commit `*.chat` files or generated build artifacts that are already ignored.

## Mathematical implementation architecture

- Read `ARCHITECTURE.md` before implementing or accelerating mathematical
  algorithms. Prefer ordinary CPython-parseable Python, then source-transparent
  `@native` compilation, then mature external libraries.
- Handwritten C/C++ is reserved for host adapters, representation primitives,
  foreign-library bindings, or a measured compiler limitation recorded as an
  architecture exception. Classify every new native file in
  `architecture/native-code.json`.
- Do not select an unrelated implementation based on a Python function name.
  Native compilation lowers the actual typed source body and preserves source
  provenance.
- Every compiled mathematical function requires a correct dynamic fallback,
  differential oracles, inspectable IR/target code, and a representative
  benchmark when performance motivates the work.
- Run `pnpm architecture:check` for architecture, native compiler, or native
  mathematical changes.

## Parallel projects

- Use `pnpm parallel:new` for work explicitly assigned as one lane in a
  multi-project effort. Each project gets its own branch, Git worktree, and
  `.agents/tasks/<id>.json` contract.
- Claim the narrowest files or directories that contain the implementation.
  Do not edit outside those claims; coordinate shared API, package, CI, and
  registry changes through the integration lane.
- Run `pnpm parallel:check` before coding and before handoff. Use
  `pnpm test:changed` for the deterministic checks implied by the diff and
  `pnpm parallel:run` to record final validation receipts.
- Set the contract to `review` only after filling in its handoff summary,
  risks, and next steps. Validation receipts must describe the current
  workspace, not an earlier revision.
- See `PARALLEL-DEVELOPMENT.md` and `.agents/lanes.json` for the complete
  workflow and machine-readable lane boundaries.

## Git

- By default, agents should auto-commit completed change-sets after relevant validation passes.
- Do not wait for an explicit "commit" request unless the user asked not to commit, the work is clearly exploratory/incomplete, or there are unrelated worktree changes that would make an automatic commit unsafe.
- By default, write commit messages with:
  - a concise first line (subject), and
  - a detailed markdown body explaining details of the commit, which is more succinct than the agent turn summary, including only information that is valuable longterm.
  - do not include a dedicated `Tests and validation` section; mention verification only when it adds long-term value.
  - do not embed literal escaped newlines (e.g. `\n` or `\\n`) in commit messages.
  - For multiline commit messages, always use stdin/heredoc or a message file instead of `git commit -m`.
  - In `exec_command` / shell tool calls, do not rely on quoted `\n` sequences to create commit-message line breaks; use literal newlines in the heredoc body.
  - Safe default pattern:

```
git commit -F - <<'EOF'
<subject line>

<body>
EOF
```

- `git commit -m` is only for subject-only commits with no body.
- Prefer follow-up commits over amending or rewriting history unless the user explicitly asks for that.
