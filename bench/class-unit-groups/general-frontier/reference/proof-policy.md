# Explicit reference proof policy

These developer-only reference workers perform cost discovery, not competitive
qualification or detached certificate verification. Both CLIs accept
`--proof-policy conditional-grh|unconditional`; the default is conditional, but
every new request serializes its chosen policy explicitly.

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

Both policies now emit `sagejs-pari-frontier-screen-v3` or
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
