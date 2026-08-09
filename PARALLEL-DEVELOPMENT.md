# Parallel development

Sage.js is broad enough for many independent agents or people to make useful
progress simultaneously. Parallel work succeeds when each project is bounded,
its mathematical oracle and performance target are explicit, and shared
interfaces change through deliberate integration rather than accidental
overlap.

## One project, one worktree, one contract

Create a project with a narrow list of files or directories it may change:

```sh
pnpm parallel:new -- modsym-newspace modular-forms \
  --objective "Compute and decompose weight-2 new spaces efficiently" \
  --claim src/baselib/modular.py \
  --claim packages/flint/src/p1.c \
  --claim packages/flint/src/p1.h \
  --claim bench/modular-symbols-decomposition.sage
```

This creates `agent/modsym-newspace` in an isolated sibling worktree, installs
the pinned dependency graph, initializes submodules, and writes
`.agents/tasks/modsym-newspace.json`. The contract records:

- the concrete objective and responsible lane;
- exclusive write claims;
- base commit and dependencies;
- Sage, papers, libraries, or datasets used as references;
- required correctness, compatibility, and benchmark commands;
- Linux, Windows, macOS, and architecture policy;
- reproducible validation receipts and a concise handoff.

Every contract also records an architecture strategy, fallback, correctness
oracles, and exceptions. Mathematical lanes default to ordinary Python.
Source-transparent compiler work declares `source-transparent-native` and the
CPython/JavaScript oracles. `native-primitive` and `mixed` work requires an
explicit exception explaining why the implementation order in
[`ARCHITECTURE.md`](ARCHITECTURE.md) is insufficient.

Use `--no-install` when an external provisioning system will prepare the
worktree. Run `pnpm parallel:new -- --help` for all options.

Claims are intentionally narrower than a subsystem. Two projects may work in
the same lane as long as they do not claim the same files. Tests, benchmarks,
documentation, and upstream Sage fixtures are allowed collateral, but they
must still be claimed explicitly. Changes to shared APIs, package manifests,
CI, native ABI, or release infrastructure belong in the integration or
distribution lane.

## Daily loop

Inside a project worktree:

```sh
pnpm parallel:check                 # contract and current write scope
pnpm test:changed                   # checks implied by changed files
pnpm parallel:run -- TASK -- pnpm test:native
pnpm parallel:status
```

`parallel:run` records the command, duration, result, commit, host platform,
and a fingerprint of the workspace excluding its own task manifest. A passing
receipt therefore becomes stale whenever relevant code changes. Before review,
set the task status to `review` and fill in `handoff.summary`, risks, and next
steps. `parallel:check` then requires fresh passing receipts for every declared
validation command.

The coordinator runs `pnpm parallel:status` from any worktree. It discovers all
Git worktrees, reads their task contracts, reports dirty/ahead/behind state, and
fails if active projects have overlapping claims. `--json` provides the same
information to agents and orchestration software.

## Project sizing and integration

A good parallel project takes roughly half a day to two days and ends in one
coherent commit or a small reviewable series. Split exploratory surveys from
implementation. Prefer one explicit algorithm or compatibility surface over
“improve symbolic math.” Each project should establish:

1. Sage-compatible semantics and correctness examples.
2. A baseline against Sage, Magma, PARI, eclib, or another relevant oracle.
3. A focused regression test.
4. A benchmark when performance is part of the objective.
5. Native Windows support or an explicit, tested capability fallback.
6. Documentation and provenance for public behavior and imported algorithms.
7. An architecture classification and an explicit explanation for new
   handwritten mathematical native code.

Merge small completed projects frequently. Rebase or merge `origin/main`
before final validation, then regenerate receipts. The coordinator owns shared
interface changes and resolves dependencies between projects. Do not let every
project edit central registries or package manifests; queue those changes for a
short integration project.

## Repository commands

| Command | Purpose |
|---|---|
| `pnpm parallel:new` | Create a branch, worktree, and task contract |
| `pnpm parallel:check` | Validate contracts, claims, changes, and receipts |
| `pnpm parallel:status` | Summarize every worktree and detect overlap |
| `pnpm parallel:run` | Run and record an exact validation command |
| `pnpm test:changed` | Run the deterministic checks implied by a diff |
| `pnpm architecture:check` | Enforce package, native-code, and kernel policy |

Lane definitions live in [`.agents/lanes.json`](.agents/lanes.json). They are
machine-readable policy, not an ownership wall: extend them through a reviewed
integration change when Sage.js gains a new subsystem.
