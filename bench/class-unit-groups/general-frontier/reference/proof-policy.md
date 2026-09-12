# Explicit reference proof policy

These developer-only reference workers perform cost discovery, not competitive
qualification or detached certificate verification. Both CLIs accept
`--proof-policy conditional-grh|unconditional`; the default is conditional, but
every new request serializes its chosen policy explicitly.

## Whole-batch retention (v4)

New multi-iteration requests emit `sagejs-pari-frontier-screen-v4` or
`sagejs-hecke-frontier-screen-v4`. Single iterations still use v3. Historical
v3 batches keep their documented last-only meaning; they are not upgraded.
The v2 descriptions in the separate explicit-output and witness documents are
historical format introductions; this document specifies the current policy.

V4 retains the v3 header and last `compact` summary, adds
`seed_scope="once-per-batch"` and an ordered `iteration_outputs` array, and sets
`batch_outputs_complete=true`. Each array member has exactly `iteration`
(contiguous integers 1 through N), `compact`, and `proof_execution`. The last
member's compact object must equal the header summary. Every member is strictly
validated, including all exact leaves and witness dimensions, under the same
request precision, proof policy and source-bound computation. Exact scalar
summaries must agree across iterations, but generators and witnesses need not
be identical. Aggregate proof durations must equal the sum of the individual
records. Each unconditional record attests one full proof execution; conditional
records remain null. This is execution evidence, not independent proof replay.

Every iteration still constructs fresh field/bnf state. The seed initializes the
batch once, not each member separately; ordinal metadata must not be interpreted
as an independently seeded singleton request. Only ordinary compact data or its
serialization is retained, never previous live mathematical contexts.

Retained entry serialization occurs inside the aggregate worker timer. PARI also
assembles the final v4 envelope inside that timer; its singleton v3 envelope
boundary is unchanged. Hecke retains its existing final transport-envelope
serialization outside the timer, with each entry's complete compact
materialization inside. No per-iteration durations are invented from the batch
average. Neither format measures cached-answer retrieval.

Both producers count retained serialized entry bytes, the duplicated last
compact summary, and 64 KiB reserved envelope headroom against the existing
32 MiB response cap. A producer guard raises `batch output limit`; the outcome
is a retained error, not a truncated successful batch. The receiver's independent
output cap, process memory limit and cleanup rules remain unchanged. Very large
compact outputs can therefore decline, and no automatic smaller-batch retry is
authorized. Failed or partial batches are not normalized as successful members.

The receiver uses internal singleton *validation views* to reuse the existing
strict v3 compact validators. These views are neither emitted measurements nor
claims of per-iteration RNG resets. Normalized v4 rows retain every original
entry, the seed scope, and each engine's unchanged regulator guarantee. The
single-sample discovery pairer remains single-sample and unqualified; this patch
does not invent a repeated-timing qualification report or matching enclosures.

For future controlled sampling, predeclare per-engine batch counts from existing
discovery so tiny fresh batches contain at least one second of timed work. A
completed batch below that duration stays below-duration evidence; it is not a
license to retry without reservation. Seconds-scale cases can use v3 singletons
with at least three fresh samples. Keep 100/200-bit requests and unconditional
controls explicit. PARI's working-precision regulator is still not mathematically
equivalent to Hecke's absolute-radius enclosure.

Offline validation adds `runner/test_batch_evidence.py` for both precisions and
policies, early-member corruptions, missing/reordered/duplicate members, proof
sum and policy splices, partial output, caps and historical v3 semantics. Static
worker assertions are not live GP/Julia validation. Live diagnostics require
separate authorization; platform checks, M0 qualification and independent
detached replay remain incomplete.

Prepared optional live gate (never part of default offline tests):
`persistent/local-smoke.py --batch-evidence-matrix --seconds 180 --output NEW_DIR
--local-uncontrolled`, with explicit engine/executable/worker and the already
provisioned Hecke project/depot. This predeclares exactly 24 requests: the existing
three toy fields, both proof policies, both precisions, each once as v3 singleton
and once as v4 two-iteration batch. All 36 compact outputs receive the existing
decoded exact toy equations/mutation checks; 18 iterations use unconditional
proof. Each engine uses one process, with startup and five seconds reserved
cleanup included in its 180-second deadline. No retry, environment build, or
extra field is allowed. Completion records retained and toy-replayed output
counts separately. These toy checks are not general independent completeness
proofs and the local wall times are not controlled performance measurements.

### Source-bound local result, 2026-09-12

Source commit `478a94d3aca41d912fef731db17284f2f7105c36` passed exactly one
authorized matrix process per engine: PARI 2.17.1 and Julia 1.12.7 / Hecke 0.40.0.
Each completed all 24 requests, retained and toy-replayed all 36 outputs, and
executed 18 unconditional proof iterations. Both processes closed; the driver's
worker/runtime/project/manifest hashes matched before and after. No retry,
installation or build occurred in these invocations. This is local correctness
evidence, not complete dependency attestation, independent completeness replay,
or controlled timing. Whole diagnostic walls were 0.419546908 seconds for PARI
and 31.891281789 seconds for Hecke, including startup and toy replay.

Raw source snapshots, requests, responses, decoded outputs and completion records
are retained in backed-up campaign custody at
`/home/user/sagejs-worktrees/class-unit-rank-two-frontier/build/general-frontier/reference-batch-evidence-live-v1/{pari,hecke}`.

| Evidence | SHA-256 |
| --- | --- |
| PARI decoded 24 results / 36 outputs | `7df8a817b27301c3ebdd8ec190bf3d20a238ccbed4f7e5f5faef9ee382b3fd2a` |
| PARI exact-array replay response | `c8c287bf72dafd069626be47e66828189a26330345152f58d6b16a8ed28149ef` |
| Hecke decoded 24 results / 36 outputs | `e0eb73e27415505304ce9f5f31242a151f6c7d7bf32f9cf490e5d9b88e507b90` |
| PARI worker | `62a0294836f9bda5c00ea7dd90dfecb43a72bf57f160c4b6d38964d80231093a` |
| Hecke worker | `481d7fee854882eb09dfe35b6a2f32fe3c6b6df40916f0407aef4a59893b6ae7` |
| Hecke all-member toy bootstrap | `7d0c1ebf7cbe3fd4b34aafc1849070601d473aee9524c495569fa8ea163d1b6a` |

The existing environment used
`/tmp/hecke-generator-witness-env-EvWEZU` and the separately prepared strict
existing-image depot
`/scratch/sagejs-runtime/general-class-unit-m0-hecke-repair-v1/depot`.
All 67 offline runner tests and 20 persistent tests pass, as do CPython syntax,
Ruff and strict Pyright checks for 389 modules. Exact-base `test:changed` passes
merge invariants then fails because this narrow worktree has no built
`dist/tools/compiler.js`; that failure is retained. Native/build/platform
qualification is not inferred from the toy matrix, and this remains draft work.

The subsequent pure-helper split moves the exact toy arithmetic functions into
`hecke/toy-replay.jl` without edits (SHA-256
`e60e9231e845d03861deff56db642a1d6f23be2a1e847a939054a5b44b691123`).
The standalone regression still imports `Test` and retains its entire testset;
the diagnostic bootstrap loads only the pure helper. The worker factory pins
that transitive helper and includes its source in diagnostic custody, rejecting
a change between factory preparation and process construction. This removes an
unneeded test-framework cache dependency without disabling any toy checks or
changing Julia's strict existing-image policy. Historical live results above
remain tied to the pre-split source; the split requires its own authorized live
gate before making any new runtime claim.

## Complete-request boundary

Every iteration constructs a fresh field and performs all requested work. The
same outer timer includes group computation, the requested proof calls, maps,
literal-generator-product witnesses, units and compact materialization.

| Request | PARI | Hecke |
| --- | --- | --- |
| `conditional-grh` | `bnfinit(P,1)` and the existing compact computation | Both `class_group(O; GRH=true)` and `unit_group_fac_elem(O; GRH=true)` |
| `unconditional` | After each `bnfinit(P,1)`, require exact integer `bnfcertify(b,0)==1` before units/maps | Both public calls receive `GRH=false`, including the unit call after an already-finished class/unit context |

The PARI zero flag is essential: flag one proves only quotient/subgroup
statements and is rejected. Hecke has separate class and unit proof owners;
the class call alone is insufficient. No cached-context shortcut, trivial-group
exception, conditional fallback or replacement field is introduced.

The primary basis is PARI's installed `bnfcertify` manual and pinned Hecke
0.40.0 `src/NumFieldOrd/NfOrd/Clgp.jl`: the class public call requests
`GRHClassGroup`, while `unit_group_fac_elem` requests `GRHUnitGroup` and also
handles its cached finished context. Completion receipts bind these public
calls to reviewed source. They are not independent proof replay.

## Explicit versions and execution records

The original explicit-policy v3 introduction emitted `sagejs-pari-frontier-screen-v3` or
`sagejs-hecke-frontier-screen-v3`. Exact compact leaves, class-generator order,
literal-product witness semantics and torsion-first unit coordinates are
unchanged. PARI still uses its scalar result plus `FRONTIER_COMPACT_JSON` frame.
Its direct function now requires six arguments:

```text
frontier_case(id, coefficients, bits, iterations, seed, proof_policy)
```

Hecke accepts exactly seven tab-separated fields; the final field contains
comma-separated integer coefficients, not expressions:

```text
FRONTIER2  id  bits  iterations  seed  proof_policy  coefficients
```

Both standalone `main` and the persistent bootstrap pass the same explicit
policy. Old live `FRONTIER1` requests are rejected.

Each v3 result has `proof_policy` matching its request, `independent_replay=false`,
`retained_iteration=iterations` and `batch_outputs_complete=(iterations==1)`.
Only the final compact output is retained. This is not whole-batch replay.

For conditional results `proof_execution` is exactly null. Unconditional
results contain exactly the following engine-specific fields:

```json
{
  "method": "pari-bnfcertify-full",
  "flag": 0,
  "last_return": "1",
  "completed_iterations": 2,
  "certification_milliseconds": "0"
}
```

```json
{
  "method": "hecke-class-and-unit-grh-false",
  "class_group_grh": false,
  "unit_group_grh": false,
  "completed_iterations": 2,
  "class_group_call_nanoseconds": "0",
  "unit_group_call_nanoseconds": "0"
}
```

The examples describe types, not measured results. Durations are cumulative
canonical nonnegative integer strings inside the outer request timer. Hecke's
durations include complete public-call computation, not isolated proof costs.
They must never be subtracted from the request duration. Counts attest completed
source-bound calls, not retained outputs from every iteration.

The regulator's nested `fundamental_units_policy` must match the same request.
Full group proof does **not** make PARI's regulator rigorous: it remains a
working-precision approximation without enclosure endpoints. Hecke retains its
absolute-radius enclosure. These asymmetric numerical guarantees are not a
matched regulator contract.

## Receipts and failure handling

New persistent and fresh cost-screen receipts use `.v2` and retain
`requested_proof_policy` for every outcome, including warmups, failures and
interruption. Persistent `run.json` uses
`sagejs.general-frontier-persistent-request.v2` with the same policy.
New successful receipts require v3 worker output even for conditional requests.

Warmups use the selected policy, with one iteration, and repeat after restart.
A warmup failure stops sampling as before. Timeouts, errors, output limits and
interruption remain failures; normalization does not expose completed proof
fields on failed rows. A fresh interrupted attempt now also publishes its raw
receipt before re-raising, retaining the full pending reservation. Ledger
schema, initial/version charges, reservation arithmetic, lock, affinity,
memory/swap policy and process cleanup are unchanged.

Historical native PARI text/PARI v2 and Hecke v1/v2 outputs retain only their
known conditional meanings. The reader does not add unconditional execution
records or relabel prior receipts. Run/receipt/worker/nested-policy mismatches
fail closed. Same-policy scalar pairing remains paired discovery only; it does
not establish independent maps, regulator equivalence or qualification.

## Focused validation and optional diagnostic

The default Python tests are offline and never start GP or Julia:

```sh
python3 -B -m unittest discover -s bench/class-unit-groups/general-frontier/reference/runner -p 'test_*.py'
python3 -B bench/class-unit-groups/general-frontier/reference/persistent/test_supervisor.py
```

Policy regressions cover both CLIs/encodings, typed execution-record mutations,
both precisions and iteration scopes, historical semantics, same-policy pairing,
warmup/restart, raw failures and pending-reservation interruption behavior.

After source review and separate execution authorization, the existing
`persistent/local-smoke.py --proof-policy-matrix --seconds 180 --output NEW_DIR
--local-uncontrolled` fixture uses one existing Worker per engine. Supply its
explicit executable/worker and, for Hecke, project/depot arguments. It never
installs or builds dependencies. Its immutable inputs bind source/runtime hashes.

The fixed matrix contains `x^2+5`, `x^2-2` and `x^4+1`, both policies at both
100/200 bits, plus one unconditional two-iteration `x^2-2` request: 13 requests
and eight unconditional proof iterations. One deadline includes startup and
reserves five seconds for cleanup. No automatic retry or extra process follows
a failure; startup/cache failure or a deadline is reported as incomplete.

For this fixture only, the existing Hecke bootstrap can load the existing tiny
exact decoder with `--toy-replay`; the normal CLI does not expose that switch.
Decoded literal ideal equations, witness mutations, class powers and exact unit/
torsion checks run outside the measured worker call. PARI reuses its existing
exact-array toy helper in the same process after decoding the frames, without
recomputing a class group or comparing generators from different presentations.
These small equality checks are not independent completeness proofs. Diagnostic
wall times include them and are never qualifying performance evidence.

Source/offline checks alone do not establish that the new unconditional live
matrix passes. M0, broader platform/build gates, actual unconditional selection,
matched requests and stress qualification remain separate pending work. Future
batch counts should be predeclared separately per engine; a slower reference is
not forced to repeat the faster reference's tiny-field batch count.
