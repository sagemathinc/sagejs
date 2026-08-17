# Number-field maximal-order oracle and profiler

The maximal-order benchmark is a correctness gate first and a stopwatch
second. A timing is accepted only after the returned rational power-basis
lattice passes an independent exact checker. External agreement is evidence,
not certification.

The checked mathematical authority is
[`test/fixtures/number-field-maximal-order-corpus.json`](../test/fixtures/number-field-maximal-order-corpus.json).
It contains stable mathematical facts only: ascending-power integral
coefficients, polynomial and field discriminants, equation-order indices,
canonical lattice digests, provenance, and local-index evidence. The small
[`bench/number-field-maximal-order-manifest.json`](../bench/number-field-maximal-order-manifest.json)
contains only case selection, adapter boundaries, sampling, and resource policy.
Raw samples, RSS observations, versions, stage traces, and terminal states live
in generated report JSON and never mutate the corpus.

## Commands

Validate the frozen certificates without launching a CAS:

```sh
node tools/number-field-maximal-order/cli.cjs validate
```

Discover local runtimes and versions:

```sh
node tools/number-field-maximal-order/cli.cjs capabilities
```

Run the published baseline through every available free adapter, keeping each
oracle warm and bounded:

```sh
node tools/number-field-maximal-order/cli.cjs run \
  --profile baseline \
  --systems sagejs,sage,pari,hecke,oscar \
  --include-cold \
  --output /tmp/maximal-order-report.json \
  --markdown /tmp/maximal-order-report.md
```

Magma is proprietary, opt-in, and never a CI requirement:

```sh
node tools/number-field-maximal-order/cli.cjs run \
  --profile quick --systems magma --magma --include-cold
```

For an interactive Sage.js shell, the convenience launcher runs the same
certifying driver rather than parsing the large corpus inside the measured
runtime:

```sh
bin/sagejs bench/number-field-maximal-orders.sage
```

It defaults to the `quick` Sage.js profile. The environment variables
`SAGEJS_NFMO_PROFILE`, `SAGEJS_NFMO_SYSTEMS`, and `SAGEJS_NFMO_OUTPUT` select
another profile, system list, or report path without copying corpus cases into
the script.

Executable and Julia-project paths, samples, warmups, case filters, timeout,
and memory bounds are command-line options; run `cli.cjs --help` for the full
surface. A local-prime restriction in the manifest is passed to PARI's
`nfbasis([T, listP])` boundary. Stress cases require the `stress` profile and
are intended for explicit case/system filters.

## Adapter boundaries

| Adapter | Row label | Persistent boundary | Family |
| --- | --- | --- | --- |
| Sage.js selector | `warm-public`, `factor-discovery` | fresh field, `maximal_order()`, materialization | Sage.js |
| Sage.js Python fallback | `dynamic-public` | explicit readable Round-2 path | Sage.js |
| Sage.js native | `native-public` | explicit FLINT-storage Round-2 path or `unsupported` | Sage.js |
| Sage/sagelite | `warm-public`, `factor-discovery` | fresh field and Sage public API | PARI/Sage |
| GP/PARI | `nfbasis`, `nfinit`, `factor-discovery` | direct persistent GP calls | PARI/Sage |
| Hecke | `core` | direct persistent Hecke `maximal_order` | Hecke/Oscar |
| Oscar | `warm-public` | persistent full Oscar public API | Hecke/Oscar |
| Magma | `warm-public` | persistent black-box `MaximalOrder` | Magma |

Hecke and Oscar are separate API/cold-start rows but one implementation vote.
Likewise, Sage and PARI are one implementation family. The report never
silently turns five API results into five independent mathematical votes.

The first request to a newly spawned adapter can also produce a
`cold-application` record. It separates process/package startup and lazy
loading from the request that constructs the field and materializes the basis.
Warm algorithm rows never substitute cold timings.

## Verification and canonicalization

Every adapter serializes a square rational matrix whose rows are coefficient
vectors in the defining power basis. The driver then:

1. normalizes every rational and reduces the scaled integer row lattice to a
   canonical row Hermite form with a positive common denominator;
2. proves the matrix is nonsingular and that its inverse is integral, so the
   reported order contains the equation order and `1`;
3. multiplies every pair of basis elements modulo the monic defining
   polynomial and proves the resulting basis coordinates are integral;
4. checks
   `disc(equation order) = index^2 * disc(reported order)` exactly;
5. checks the field discriminant, equation-order index, and SHA-256 canonical
   lattice digest against the frozen certificate.

The polynomial irreducibility check occurs once outside retained timing
regions. A wrong basis, index, or discriminant becomes `invalid`; its raw
samples remain under rejected evidence and its accepted timing statistics are
cleared. If independently verified families disagree and no frozen digest is
available, every affected row becomes `disagreement`; the driver deliberately
does not choose a majority.

## Bounded state model

Each record ends in exactly one state:

- `ok`: independent verification succeeded;
- `invalid`: an oracle returned a result that failed exact verification;
- `disagreement`: verified external lattices disagree;
- `timeout`: the request exceeded its per-case/system wall bound;
- `crash`: startup, protocol, or process execution failed;
- `unavailable`: an executable or configured adapter is absent;
- `unsupported`: the adapter rejects the boundary or input.

Persistent external-CAS subprocesses have a per-process address-space bound on
Linux and every adapter has a hard process-group timeout. Sage.js is bounded by
V8's old-space limit instead: an OS address-space cap is incompatible with
V8's large virtual reservations and causes false startup failures. Each report
labels the applied limit kind. Peak resident memory is sampled from `/proc`
when available. Other platforms retain the requested memory policy and
explicit capability metadata, but RSS sampling is reported as unavailable
rather than invented. Magma's basis is streamed entry-by-entry so its terminal
line-width formatting cannot corrupt large exact coefficients.

## Stage evidence and the bad-generator regression

Raw samples retain stage maps rather than flattening them into stable corpus
facts. Public adapters distinguish field construction, maximal-order work,
public-object materialization, and certification. GP records direct `nfbasis`,
`nfinit`, and factor-discovery boundaries. Where a public CAS does not expose
local-prime or basis-merge internals, the trace says so explicitly.

The mandatory degree-8 bad-generator case is
`minpoly(theta + 2^32*theta^2)` for `theta^8 = 2`. On the development host,
the bounded driver independently verified PARI's maximal-order lattice and
field discriminant `-2147483648`; direct `nfbasis` completed while generic
factorization of the defining discriminant hit its 30-second bound. Thus a
report attributes the current failure to eager factor discovery instead of
mislabeling it as slow local-order arithmetic. The manifest retains Magma's
180-second bound so its known timeout remains evidence, not a missing row.

## Reproducibility metadata

Generated reports record the Sage.js commit and dirty state, manifest digest,
exact polynomial and certificate digests, OS, architecture, CPU model, Node
version, process/package versions, pinned Hecke/Oscar Git revisions, warmup and
sample policy, limits, raw samples, robust median/MAD statistics, peak RSS, and
basis byte size. A native artifact hash is recorded when supplied through
`SAGEJS_NATIVE_ARTIFACT_HASH`; otherwise the report explicitly says that no
artifact identity was supplied.

The harness is ordinary Node.js plus runtime-specific worker scripts. It adds
no production dependency on Sage, PARI, Julia, Oscar, Hecke, or Magma.
