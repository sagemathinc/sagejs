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

The new branch starts at the invoking worktree's current `HEAD`. This matters
for coordinated work on an integration branch that is intentionally ahead of
`main`: workers inherit the exact reviewed foundation from which they were
launched. Use `--base REF` when a different base is deliberate; the resolved
commit is always recorded in the task contract.

Every contract also records an architecture strategy, fallback, correctness
oracles, and exceptions. Mathematical lanes default to ordinary Python.
Source-transparent compiler work declares `source-transparent-native` and the
CPython/JavaScript oracles. `native-primitive` and `mixed` work requires an
explicit exception explaining why the implementation order in
[`ARCHITECTURE.md`](ARCHITECTURE.md) is insufficient.

Native dependency builds use a content-addressed store in the repository's
shared Git directory. `parallel:new` restores matching artifacts automatically,
and `pnpm parallel:cache -- prepare` builds and atomically publishes misses.
On a fresh checkout, `prepare` builds the Sage.js compiler before attempting
the first generated native addon; callers do not need to memorize a separate
bootstrap ordering. A content stamp ties those compiler outputs and every
addon key to the complete compiler/tool source snapshot, so pre-existing
`dist/` files cannot silently compile a new cache entry after their sources
change.
Large dependency prefixes that are declared immutable, currently the pinned
FFLAS/Givaro/GMP/OpenBLAS prefix, are mounted read-only from that store instead
of copied into every worktree. Addons remain independent snapshots because
their keys include the Node ABI and generated adapter inputs. Override the
store with `SAGEJS_PARALLEL_NATIVE_CACHE` when the Git directory is on a small
filesystem. Cold publishers hold a process-birth-identified lease whose
heartbeat advances even while a synchronous compiler or linker is running;
concurrent worktrees therefore wait without mistaking a long build for a dead
owner, while crashed or rebooted owners are recoverable.

Inspect the shared store without building anything:

```sh
pnpm parallel:cache -- status
pnpm parallel:cache -- status --json
```

The report separates current or installed generations from obsolete ones,
shows their apparent byte sizes, and reports active build locks. New
publications also record their native toolchain and mathematics-profile
generation in the cache manifest. Existing manifests remain readable and are
reported without profile metadata.

Explicit cleanup is a dry run unless `--apply` is present:

```sh
pnpm parallel:cache -- cleanup
pnpm parallel:cache -- cleanup --apply \
  --max-generations 4 --max-bytes 8GiB
```

Apply mode is always capped (8 generations and 20 GiB by default). It retains
the currently selected content keys, every generation linked into a live Git
worktree, and every generation with a build lock. Each candidate is checked
again immediately before its atomic quarantine and deletion. Maintenance
accepts only the exact configured or explicitly supplied cache root, refuses
filesystem/home/workspace roots, and stops without deleting anything when a
root, artifact family, or generation directory is symlinked or has an
unexpected layout. `--cache-root` is useful for inspecting a deliberately
relocated store; it does not relax those checks.

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
pnpm merge:check                    # fast cross-branch inventory invariants
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

Every Node test declares its runner tier in its own header with
`// sagejs-test-tier: unit`, `integration`, or `specialized`. Optional
`sagejs-test-portable`, `sagejs-test-smoke`, and `sagejs-test-platform`
markers refine the routine profiles. The runner discovers these declarations;
there is no second central list to repair after a merge. `pnpm merge:check`
runs before builds and fails closed on missing test metadata, unresolved merge
state, stale native-source policy, or stale WebAssembly inventories.

The coordinator runs `pnpm parallel:status` from any worktree. It discovers all
Git worktrees, selects the one live contract named by each `agent/ID` branch,
reports dirty/ahead/behind state, and fails if those active projects have
overlapping claims. Inherited historical or unrelated live manifests are not
mistaken for projects owned by every worktree. `--json` provides the same
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
| `pnpm parallel:cache -- status` | Report shared native-cache size and retained generations |
| `pnpm parallel:cache -- cleanup` | Dry-run bounded obsolete native-cache cleanup |
| `pnpm test:changed` | Run the deterministic checks implied by a diff |
| `pnpm merge:check` | Fail fast on cross-branch inventory and merge invariants |
| `pnpm architecture:check` | Enforce package, native-code, and kernel policy |

Lane definitions live in [`.agents/lanes.json`](.agents/lanes.json). They are
machine-readable policy, not an ownership wall: extend them through a reviewed
integration change when Sage.js gains a new subsystem.
