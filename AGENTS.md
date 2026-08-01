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
- Treat native Windows x64 as a first-class target. New native dependencies
  must pass Windows CI or have an explicit capability flag with a tested correct
  fallback; do not make WSL, MSYS2, or MinGW part of the supported user path.
- Commit coherent completed work and push each commit to GitHub promptly.
- Do not commit `*.chat` files or generated build artifacts that are already ignored.

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
