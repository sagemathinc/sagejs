# Experiment: faithfully port PARI's class-group computation to compiled Python

## Question and authority

**Holding PARI's mathematical strategy fixed, can ordinary Python compiled by
Sage.js execute a useful class-group computation at comparable cost? If not,
which dependency, representation, arithmetic kernel, or compiler behavior is
responsible?**

This is a language/runtime experiment, not an algorithm-design or proof project.
For this experiment, explicitly assume the pinned PARI implementation's
undocumented or unproved mathematical bounds, heuristics, and stopping claims
are right. Do not replace them with stronger bounds or insert additional exact
certification into the timed path. This assumption does **not** excuse a
translation error, memory error, or unexplained disagreement with PARI.

Status: **plan only**. The requested clean worktree starts from Sage.js
`40a0e7e81` on `origin/main`. Adopting this plan starts a separate bounded
experiment; writing or merging it does not start implementation, change public
defaults, complete M0, or extend M0's budget. Existing measurement work keeps
its own ledger and ownership. Do not interrupt it or start competing work on
its timing host. Pause new speculative class-group algorithm redesign while
executing this experiment.

## Scope: a class-group path, not merely an easy helper

Target the general PARI path corresponding to **`bnfinit(nf, 0)`**, starting
from a prepared maximal-order number field and ending with the computed class
number and invariant factors. Retain the relation, unit/regulator, linear
algebra, and stopping work that this PARI path actually needs. Do not infer
that class groups can be computed independently of units.

The preparation boundary is the state produced by `nfinit(P)`, not a completed
`bnf`, relation matrix, known unit, regulator, or class-group answer. Freeze its
exact interchange representation and the corresponding PARI preparation call
before timing. Report preparation, conversion, and result publication costs
separately; also report their total when a complete polynomial-input path is
available. A prepared-order result is not an end-to-end public API result.

First target: totally real cubics and mixed-signature quartics, both of unit
rank two. Complex cubics and quintics provide transfer controls. No quadratic
specialized engine, ray/S-class groups, Galois groups, complete public unit or
principal-ideal maps, production dispatch integration, or new CAS packaging.
Do not remove upstream internal work just because the reported answer is small;
any omitted output construction must be labeled a different workload.

There are two legitimate checkpoint outcomes:

- **Prepared-field path translated:** the port itself discovers enough
  relations and unit information, follows the upstream termination logic, and
  obtains the class invariants without calling PARI's class-group engine.
- **Path incomplete, substantial segment translated:** a real, expensive
  connected segment runs from recorded input state to its corresponding output
  state, with all remaining dependencies listed. This is useful feasibility
  evidence, but cannot establish whole-engine performance or completion.

Do not silently replace the first objective with a norm test, a scalar helper,
or HNF alone. If the whole path cannot fit, explain the obstruction explicitly.

## Pin and map before translating — at most 2 active hours

Use **PARI 2.15.4** for this first experiment, matching the existing reference
campaign rather than mixing source versions. The repository's
[existing forensics](../docs/general-class-unit-frontier.md) records:

- Upstream revision: `e87796ac3acc76eab7a459c39c271b61a2b16fc3`.
- [Official source archive](https://pari.math.u-bordeaux.fr/pub/pari/OLD/2.15/pari-2.15.4.tar.gz):
  SHA-256 `c3545bfee0c6dfb40b77fb4bbabaf999d82e60069b9f6d28bcb6cf004c8c5c0f`.
- `src/basemath/buch2.c`: SHA-256
  `29d1018d4d1d98f95cd94511e255a518ea81b2f55faa196f6732d659ad298674`.

Reverify these pins on execution; historical documentation is not a new source
or binary attestation. Use that source for the comparator build, or identify
and include the exact distribution patches of the binary being measured.
Do not spend the experiment repairing an unrelated installation.

Starting at the actual `bnfinit` entry, map the selected reachable path. Record
each routine's source location/hash, role, callers, mutable state, ownership,
precision behavior, and dependencies in a small correspondence table. Include
macros and implicit conventions where they affect execution. Classify leaves:

1. Existing Sage.js operation with matching semantics and suitable storage.
2. Python routine to translate directly.
3. Missing arithmetic/representation primitive.
4. Compiler obstruction, demonstrated by a minimal example.

Check existing general number-field code and the modular-symbols port for
reusable conventions. Do not inventory all of PARI. By hour two, choose and
write down the entry/exit state of the first connected port segment and the
full-path dependency frontier. If even a useful segment is infeasible, stop
with that concrete finding; do not build a generic PARI interpreter.

## Translation rules

- Preserve upstream bounds, candidate order, relation acceptance, retry and
  precision-escalation decisions, and mathematical termination tests. Upstream
  sanity checks stay; new theorem proving and stronger proof obligations do not.
- Keep a routine/block correspondence to the pinned source. Document every
  deliberate deviation. Generously credit PARI and its authors in translated
  files and project notices; retain applicable GPL and copyright notices.
- Use ordinary CPython-parseable Python, a correct same-source dynamic fallback,
  and source-transparent `@native` lowering. Follow
  [ARCHITECTURE.md](../ARCHITECTURE.md). No hidden handwritten mathematical C
  replacement, function-name dispatch, or interpreter callback inside a kernel.
- Translate `GEN` values into explicit mathematical/storage types; translate
  stack lifetime and aliasing into supported ownership. Do not reproduce PARI's
  whole object runtime. Preserve integer promotion, division conventions,
  matrix orientation, indexing, alias behavior, and precision semantics.
- Keep scratch state resident and batch boundaries. Borrowed workspaces and
  fixed-length slices are available; do not contort source to avoid testing a
  demonstrated compiler limitation.
- Prefer an existing declared arithmetic backend. Do not silently change an
  upstream algorithm while claiming the language alone caused a speed change.

A temporary hybrid is permitted **only as labeled scaffolding**: PARI may
prepare inputs or provide unported dependencies at explicit outer boundaries.
Every such dependency must be listed and timed separately. Recorded relation
or unit fixtures may test a downstream segment, but cannot qualify the whole
class-group path. A call to `bnfinit` does not count as a translated engine.
Remove opaque class-group calls from the path before claiming independence.

Any experimental result is labeled **upstream-assumed**, with the PARI pin and
dependency coverage. It must not acquire the existing verified/unconditional
proof state or silently enter public caches. No production default changes.

## A small, fixed comparison panel

Select **24 distinct development fields** before tuning the port: eight real
cubics, eight mixed quartics, four complex cubics, four quintics. Use existing
reference data and fixtures; do not acquire another large corpus or open sealed
M0 holdouts. Select for mathematical coverage and PARI cost, not port success.
Reserve eight of the 24 for a final unchanged check after initial port tuning;
this is a regression discipline, not a claim of statistical independence.

Aim for at least six nontrivial class groups, one noncyclic example, two
nontrivial equation-order indices, six reference costs above one second, and
two above ten seconds. These categories may overlap. Within one hour, freeze
available identities, coefficients and strata; record missing strata rather
than expanding acquisition or silently choosing easier replacements. No broad
generality claim if the intended degrees/ranks or seconds-scale cases are absent.

For each completed path compare exact class number and normalized invariant
factors. For a segment compare its actual output state and exact identities.
Different ideal/unit bases are not automatically errors: compare canonical
lattices, represented ideals, or the appropriate transformations. Matching
the reference establishes port correspondence under the experiment's
assumptions, not independent mathematical certification.

## Hold work constant, then explain cost

Use a diagnostic run to compare:

- factor-base selection and size; candidate and accepted-relation counts;
- relation support, lattice rank/index progression and matrix dimensions;
- unit dependencies, precision changes, retries and terminal decision;
- RNG state/draw schedule, tie-breaking and first divergent branch.

A common seed alone does not synchronize different RNG implementations. Align
the generator or use a diagnostic replay of random draws. Replay bypasses must
be excluded from end-to-end speed claims. Floating-point/library changes can
also alter branches; report the first divergence instead of asserting equal
work. Diagnostic trace collection and any offline cross-checks are untimed.

Run three execution versions: the pinned PARI C path, dynamic execution of the
translated Python, and compiled execution of the same translated Python.
Report kernel-only, prepared-field, and complete-input timings separately when
available. Fresh state per sample; no cached class-group answers. Compile and
warm outside timing, then take three paired samples in alternating system order
on one quiet host, one pinned CPU, one thread, with the same input and precision
schedule. Pin compiler, flags, libraries and result-request policy as well as
source. Use one declared starting precision for this first experiment; reproduce
upstream internal precision escalation rather than imposing a new schedule.

For tiny cases use a separate pilot to fix enough fresh computations for at
least one second per sample; discard pilot timings. If the frozen batches still
run short, retain that fact and do not silently change counts. Report compile
latency, peak memory, generated-source size and boundary/allocation counts too.

Classify any gap before proposing a fix:

| Observation | Next diagnostic |
| --- | --- |
| Different work or stopping point | Repair/understand translation, RNG or numerical divergence. |
| Same work, slower underlying operation | Compare storage/conversion and backend kernels on identical operands. |
| Same work and comparable kernels, slower port | Inspect generated IR/C for boxing, allocation, dispatch, indexing and crossings. |

Where inexpensive, call the same backend primitive from a small plain-C control
and compiled Python. A FLINT-versus-PARI kernel difference is not by itself a
compiler defect. Do not port another arithmetic library merely to obtain this
control. Allow **at most one general compiler/runtime correction**, with a
minimal reproducer and before/after measurement, inside the timebox.

## Timebox, resources and stopping rules

Execution budget: **16 aggregate active-agent hours**, not 16 per agent. Suggested
allocation: 2 dependency/source audit, 1 panel/baseline setup, 6 translation,
2 compiler/representation diagnosis or one fix, 3 comparison, 2 review/report.
All installation, debugging, review and packaging count. At hours 2 and 8,
record executable coverage and remaining dependencies. At hour 16, deliver the
finding, including an incomplete port if that is the honest outcome. No automatic
extension. Use at most two simultaneous agents if delegated, with nonoverlapping
translation/review claims and one timing coordinator.

Separate proposed compute ceiling: **6 aggregate CPU-hours** for execution and
diagnostics, including failed attempts and offline review. Bound a field request
at 600 seconds and 4 GiB/no swap, or a stricter existing limit; never raise an
internal safety limit to pass the experiment. A cap hit is a censored result,
not permission to change PARI's mathematical stopping rule. Compilation uses
existing build limits off the timing host; stop setup work after one active
hour if no suitable toolchain is available. These are execution-plan limits,
not additional M0 authority or a reservation made by this document.

Keep evidence small: counters and hashes by default, a bounded trace around the
first divergence, and reusable exact inputs. Target at most 256 MiB of archived
run evidence (excluding reproducible toolchain/build products). Do not duplicate
every compact unit object for every batch iteration or create gigabyte JSON
reports. An evidence/resource cap hit stops collection and is reported.

No benchmark on `opt` until its existing coordinator has released the host and
ledger cleanly. Use another available same-host pair if necessary, clearly
separating those timings from old measurements. Linux native is the initial
measurement target; keep portable source/fallback and record Windows/Wasm gaps.
Browser/Windows performance qualification and production integration are not
prerequisites for this feasibility checkpoint, nor may they be claimed untested.

## Deliverable and decision

Deliver a reviewed, attributed patch or explicit incomplete prototype, the
dependency/correspondence table, the 24-field input manifest, focused differential
tests, and a short reproducible report. Include selected IR/C excerpts, exact
commands/versions, timing boundaries, output agreement, work counts, coverage,
censoring, and all temporary PARI dependencies. Run the relevant changed-file,
architecture, strict-Python and native gates for executable changes; any failed
gate is visible. Use a draft PR while experimental code is incomplete; mark a
review-ready PR non-draft without implying production adoption. Planning-only
changes do not require pretending an executable experiment was run.

The report must answer:

1. How much of the real class-group path translated, and what is still missing?
2. Can it do comparable work across both rank-two degrees and seconds-scale cases?
3. Which measured cost comes from changed work, arithmetic/storage, or language?
4. What is the smallest next investment, supported by the dependency frontier?

For an actually completed, work-matched path, a geometric-mean slowdown at most
**2x** PARI on successful matched panel cases is a promising language result;
publish coverage, every failure and tail slowdown alongside it. This threshold
is an experimental decision rule, not a project-wide competitiveness claim.
A slower path with one demonstrated compiler obstruction is also informative.
A partial/hybrid path, missing expensive cases, or unexplained work divergence
is **inconclusive about whole-engine parity**, not evidence that the language
cannot do it. Stop and recommend continuation, a specific runtime fix, or a
different scope on that evidence. Do not weaken the question to claim success.

Reference: [PARI's number-field documentation](https://pari.math.u-bordeaux.fr/dochtml/html/General_number_fields.html)
describes the coupled class/unit computation and its flag-dependent output
guarantees. The pinned release source/manual, rather than a moving manual page,
governs the port. Accepting upstream mathematics provisionally is deliberate;
preserving translation semantics and attribution remains mandatory.
