# Using the Sage compatibility M2 results

M2 is a closed, measured compatibility pilot. It is not a branch that should
be merged wholesale. Its value is a set of independently reviewed results that
can be selected one at a time for implementation PRs and roadmap decisions.

The authoritative branch is:

```text
origin/agent/sage-compatibility-m2-pilot
```

The closed pilot tip is:

```text
0c0dbfe11605dd32498fdc7dfa8b789264aa5d5e
```

That tip records explicit final dispositions for all 50 selected clusters:

- 5 accepted implementations;
- 45 bounded-feasibility results;
- 0 pending, evidence-only, or missing clusters.

The branch is intentionally large. Relative to `origin/main` at closure it has
1,573 changed files and about 1.07 million added lines, including raw oracle
outputs, schemas, generated receipts, worktree contracts, and other historical
material. Do not open a PR from the entire branch.

## Inspect the closed pilot

Create a detached worktree without disturbing another checkout:

```sh
git fetch origin agent/sage-compatibility-m2-pilot
git worktree add --detach ../sagejs-m2-results \
  origin/agent/sage-compatibility-m2-pilot
cd ../sagejs-m2-results
```

Start with these files:

- `docs/sage-compatibility/m2/README.md` explains the pilot contract and
  measurement policy.
- `docs/sage-compatibility/m2/generated/pilot-progress.json` is the
  machine-readable 50-cluster closure index.
- `docs/sage-compatibility/m2/final-dispositions.json` binds the 45
  bounded-feasibility dispositions to their reviewed artifacts.
- `docs/sage-compatibility/m2/HUMAN-REVIEW.md` lists runnable accepted
  implementations, quick probes, and non-blocking human observations.

Check the closure summary with:

```sh
jq '.summary' \
  docs/sage-compatibility/m2/generated/pilot-progress.json
```

List the accepted implementations with:

```sh
jq -r '
  .clusters[]
  | select((.finalDispositionSignals // [])
      | index("accepted-implementation"))
  | [.clusterId, .portfolioId]
  | @tsv
' docs/sage-compatibility/m2/generated/pilot-progress.json
```

## Accepted implementations

`accepted-implementation` means that the exact selected M2 surface has a
reviewed Sage-compatible implementation, differential evidence, and required
platform acceptance. It does not mean complete compatibility with every API in
the surrounding Sage module.

| Cluster | Result | Main production paths | Evidence |
| --- | --- | --- | --- |
| `clu-003998` | `Feature`, `PythonModule`, `InterfaceFeature`, `JoinFeature`, and named interface features | `src/baselib/features.py` | `docs/sage-compatibility/m2/interface-feature/` |
| `clu-001307` | Plot helpers including `FastCallablePlotWrapper`, `get_matplotlib_linestyle`, `setup_for_eval_on_grid`, and `unify_arguments` | `src/baselib/graphics.py` | `docs/sage-compatibility/m2/implementations/clu-001307/` |
| `clu-000073` | Complete Conway polynomial database, Sage mapping behavior, provenance, caching, and deterministic no-filesystem failure | `src/lib/conway_polynomials/`, `src/lib/sage/databases/` | `docs/sage-compatibility/m2/clusters/clu-000073/` |
| `clu-005118` | Provider-free P/PQ/Q trees, reductions, orderings, and `reorder_sets` | `src/lib/sage/graphs/pq_trees.py` | `docs/sage-compatibility/m2/feasibility/clu-005118/` |
| `clu-004868` | Puiseux series rings and elements with rational exponents, precision, ring changes, and a dynamic fallback | `src/lib/sage/rings/puiseux_series_ring.py`, `src/baselib/series.py` | `docs/sage-compatibility/m2/feasibility/clu-004868/` |

The reusable-session name-resolution corrections developed while integrating
M2 are also a strong independent PR candidate. They prevent deleted Python
module globals from falling through to JavaScript host globals and preserve
Python cases such as `i = CC(i)`. The relevant source/test changes are in
commits `d4304fd6` and `2744ccb6`; those commits also contain M2 bookkeeping,
so extract the runtime and regression-test hunks rather than cherry-picking the
commits unchanged.

## Turn one accepted result into a PR

Use the following workflow for each implementation:

1. Create a new branch from current `origin/main`.
2. Read the cluster README, acceptance review, platform receipt, and focused
   tests at the closed M2 tip.
3. Find the implementation lineage with `git log --all -- <path>` and extract
   only the production code, focused tests, package ownership, strict typing,
   and concise durable provenance needed by that feature.
4. Do not copy `.agents/tasks/`, transient validation logs, or the whole raw
   evidence directory into the feature PR by default.
5. Rebase the focused result onto current `origin/main` and run the repository's
   normal build, focused tests, strict Python checks, architecture checks when
   applicable, native suite, and platform CI.
6. Preserve documented limitations and performance follow-ups in the PR
   description and a concise checked-in note when they affect users.
7. Review the extracted diff as new code. M2 approval is strong evidence, but
   it is not a substitute for reviewing what the focused PR actually contains.

Important extraction boundaries:

- `src/baselib/series.py` also contains power-series work that did not receive
  an accepted-implementation disposition. Extract the Puiseux changes by
  reviewed commits, not by copying the final file.
- `src/baselib/graphics.py` also contains Arrow work whose exact renderer
  differences kept it at bounded feasibility. Extract PlotMisc separately.
- Conway construction has a confirmed cold-start performance issue: automated
  evidence observed roughly 7.1 seconds and human review observed roughly
  8.0 seconds for first construction. This is non-blocking for semantic
  correctness but should remain an explicit optimization follow-up.
- The dedicated `m2-*.yml` workflows are evidence harnesses. Prefer folding
  the relevant coverage into normal CI instead of permanently multiplying
  feature-specific workflows.

Useful implementation lineage:

- Interface features: `dc565fb2`, `0613bc89`, `1ec40a27`, `496120aa`,
  `55cb845e`, `b314e4fe`.
- Plot helpers: `f20cfd6e`, `6615c2f0`, `bffedcce`.
- Conway database: `f864b946`, `c24a599c`, `bfd3bdeb`, `1c82617e`.
- PQ trees: `b4502f27`, `2b871e12`.
- Puiseux series: `213a54ca`, `da1b039a`, `44050149`, `8c3d395a`.

These are provenance pointers, not unconditional cherry-pick instructions.
Some commits include task metadata or shared integration edits.

## Use a bounded-feasibility result

A bounded-feasibility disposition is a useful result, not a failed
implementation. It records why a correct leaf implementation was not safe and
turns the missing surface into finite packages with explicit acceptance tests.

Find a cluster in the ledger:

```sh
jq '.records[] | select(.clusterId == "clu-000777")' \
  docs/sage-compatibility/m2/final-dispositions.json
```

Then follow the paths in its `basis` entries. The cluster assessment normally
contains:

- the exact selected operations and occurrences;
- Sage 10.9 oracle and source authority;
- every relevant historical-provider clue and its disposition;
- the actual Sage.js prerequisite inventory;
- a closed package dependency graph;
- total and critical-path person-day ranges;
- resource envelopes, fallbacks, and four-platform acceptance plans;
- an independent review receipt and fail-closed validation gates.

Interpret the evidence conservatively:

- Effort ranges are planning estimates, not commitments. Do not sum all 45
  totals: many clusters share foundational representations and algorithms.
- Critical-path ranges are generally more informative than total package days
  for sequencing work.
- Provider traces describe behavior that Sage.js must replace. GAP, Maxima,
  PARI, and Singular are offline oracles, not approved Sage.js runtime or
  fallback dependencies.
- Do not compute Sage-versus-Sage.js speed ratios unless the receipt explicitly
  establishes comparable workloads and timing boundaries.
- Start implementation with shared prerequisite packages. Repeating a leaf
  API without its parent representation or protocol is exactly the failure
  mode the bounded-feasibility result is intended to prevent.

## What should be preserved on `main`

A compact planning PR can preserve this guide plus the closure index, a concise
summary of each reviewed cluster, and links to immutable branch artifacts. Raw
oracle transcripts, generated schemas, benchmark samples, and large receipts
can remain on the M2 branch or be published as release artifacts. Git object
IDs and SHA-256 receipts make those artifacts auditable without adding the
entire research corpus to every future checkout.

The intended long-term loop is:

1. choose one accepted implementation or bounded package;
2. extract it into a small current-main PR;
3. rerun its oracle and ordinary repository validation;
4. merge it on its own merits;
5. record human findings and follow-up performance work without blocking
   unrelated features.
