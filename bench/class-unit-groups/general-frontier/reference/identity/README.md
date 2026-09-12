# Order identity diagnostic (not a class/unit computation)

This Linux developer-only diagnostic admits exactly the coordinator's 38
preselected stress presentations, in their supplied order, on both pinned
references. It does not select fields, alter roles, replace failures, initialize
a budget, or run a class/unit algorithm. The two emitters are deliberately small:

- PARI: `nfinit(P)`, `nfcertify(nf)`, and exact basis/discriminant/index/signature
  export. A nonempty `nfcertify` result remains recorded as unresolved, not
  established maximality. No partial prime list or known discriminant is supplied.
- Hecke: a fresh uncached field followed by `maximal_order(K)` without
  discriminant, ramification or index hints. Its public result establishes
  maximality within the trusted reference implementation, not by detached replay.
  Rational basis coefficients are explicitly serialized using numerator and
  denominator with one `/`, never Julia's alternative `//` spelling.

The output basis consists of rows in the original defining power basis. The
PARI emitter rejects a changed defining polynomial. Both emitters use canonical
integer/rational strings, retaining exact signed discriminants and indices.

## What the offline checks establish

`check.py` checks dimensions and canonical rational syntax, nonsingular basis,
containment of the equation order, multiplication closure, the exact index,
the trace-form discriminant, and `disc(P) = index^2 * D`. A Sturm sequence checks
the real-root count and signature. Paired output is compared by an integral
unimodular change of basis, not equality of arbitrary basis presentations.

These are **consistency checks, not independent maximality or completeness
proofs**. A strict suborder can satisfy the trace/index/closure identities;
a regression explicitly demonstrates that limitation. Empty PARI `nfcertify`
output and Hecke's public maximal-order result remain separate trusted-engine
claims. Neither `nfinit` output alone, paired agreement, nor trace identities
are promoted to independent certificates. Irreducibility is supplied by the
reference field constructors and previously retained family evidence, not
independently proved by this checker.

Field collisions and isomorphisms remain unresolved. Equal signed discriminants
and signatures do not prove isomorphism or distinctness. The coordinator must
reconcile coverage/reserve/quarantine collisions and retain uncertain cases
before counting any additional fields. Every pair output sets
`distinct_field_admission=false` and `independent_maximality_replay=false`.

## Bounded execution and prepayment

`driver.py` reuses the existing bounded `Worker`, strict input primitives and
coordinator timing lock. It does not use the complete-group worker or its
result validator. One new reference process is launched per input/engine.

- Exactly 38 distinct label/coefficient presentations, degrees 2–10; input
  coefficients and returned rational strings are bounded to 4096 characters.
- At most 100 basis coefficients; exact elimination and multiplication operate
  on matrices of dimension at most 10. No basis search or factorization is
  implemented in the Python checker.
- A 30-second alarm covers subprocess launch, import and mathematical work.
  Process-group cleanup uses the existing five-second wait limit. Captured
  stdout plus stderr retains the existing 32 MiB limit.
- The parent service must enforce CPU affinity `{2}`, 4 GiB memory, zero swap,
  and an **external whole-driver deadline**, including Python startup, file
  hashing, exact checks, receipt publication and final cleanup. The driver
  checks the cgroup/affinity and declared budget; it does not pretend to observe
  or authenticate the external watchdog.
- Every timeout/error is retained. There are no retries or refunds. Interrupted
  or cleanup-failed execution stops the wave. A later invocation cannot reuse
  the consumed admission.

Baseline process-plus-cleanup allowance is `76 * 35 = 2660` seconds. Declare
positive additional `overhead_seconds`, `outer_cap_seconds >= 2660 + overhead`,
and `outer_kill_grace_seconds = 5`; prepay at least `outer_cap_seconds + 5`.
For example 40 seconds of overhead gives a 2700-second outer deadline and at
least 2705 seconds prepaid. This is a proposed bound, not authorization or an
assertion that 40 seconds always suffices. An exhausted outer deadline leaves
the remaining inputs missing/censored and the entire prepayment charged.

Mandatory externally bounded invocation, under the admitted systemd controls:

```
timeout --signal=TERM --kill-after=5 2700 \
  python3 -B reference/identity/driver.py \
  --input frozen-38.json --admission admission.json \
  --ledger existing-prepaid-ledger.json --output /absolute/outcomes/wave-one
```

Use the actual admitted outer deadline, never an inferred default. External
supervisor/termination receipts belong to coordinator custody. Do not dispatch
until both emitters pass a separately approved pinned runtime fixture.

## Admission JSON

Required fields:

```
schema: sagejs.reference-identity-admission.v1
input_sha256, candidate_count: 38, engines: [pari, hecke]
process_cap_seconds: 30, cleanup_cap_seconds: 5
overhead_seconds, outer_cap_seconds, outer_kill_grace_seconds: 5
charged_before_seconds, prepaid_seconds, ledger_sha256
controls: exact existing require_controls() output
source_sha256: absolute path -> SHA256 for exactly driver.source_paths()
runtimes: pari/hecke -> executable, inventory, sha256
  Hecke additionally: project, depot
outcomes_root: existing absolute canonical writable directory
admission_id: lowercase alphanumeric/hyphen id
consumption_path: outcomes_root/admission_id.consumed
```

Each runtime pins its resolved executable and independently reviewed runtime
inventory file. Hecke also pins `Project.toml` and `Manifest.toml`. Other reviewed
runtime files can be included in the hash map. This hashes the supplied custody;
it does not manufacture authentication or discover the dynamic library closure.
Source pins include both emitters, checker, driver, existing transport,
supervisor and shared validator. Keep the deployed relative layout intact.

The ledger must already exist, be nonpending, match its exact hash, and show
`charged_seconds == charged_before_seconds + prepaid_seconds` under the existing
120 CPU-hour ceiling. The driver never modifies it. Admission authenticity and
predeclaration chronology remain the coordinator's obligations.

The admission itself may be read-only. Its exclusive one-shot consumed marker
lives in the admitted writable outcomes root. Output must be a direct canonical
nonsymlink child; traversal and symlink redirects are rejected. Outputs and
markers use exclusive creation. Preserve the marker with the raw outcomes.

Offline checks only:

```
python3 -B bench/class-unit-groups/general-frontier/reference/identity/test_identity.py
```

Tests use exact fixtures and tiny Python fake processes, never PARI or Hecke.
Runtime readiness and controlled execution are intentionally separate gates.
