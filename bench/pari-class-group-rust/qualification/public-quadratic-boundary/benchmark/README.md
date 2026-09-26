# Native public-quadratic benchmark

This is an isolated, reproducible performance qualification of the complete
imaginary-quadratic route. `panel.json` is the original frozen public-input
panel; `panel-v2.json` retains its six structurally selected fields, excludes
the old timing-nominated candidate, and adds five larger, structurally diverse
fields selected without timing-based exclusions. `run.py` builds the release
adapter, runs 15 fresh-process samples per arm and
field, alternates arm order within each pair, checks every exact output, and
writes `receipt.json` with raw clocks, medians, ratios, and build identities.
When run from a dirty integration worktree, the generated receipt is explicitly
marked **pre-promotion** and binds the exact reachable source closure by
content, rather than attributing those bytes to the current Git commit.

The Rust clock covers public coefficient validation, maximal-order
preparation, reduced-form enumeration, group construction, certificate
construction, and a private one-shot authentication of the published result
against the exact in-process group-structure witness. This authentication is
producer-bound and cannot be invoked on external data. The separately exposed
detached verifier re-enumerates the forms and independently replays every
generator translation; correctness campaigns and counterfeit tests exercise
that path, but its deliberate duplicate work is reported separately from the
public fresh-field call. The matched PARI public-call clock covers consecutive
`nfinit0` and `bnfinit0` calls at 192 bits. PARI flag zero computes the same
exact class-group projection and also does the rank-zero unit/regulator work.
Both clocks exclude process startup and JSON projection. A new process
reconstructs the result on every sample; there is no cached-result reuse. PARI
and the frozen answers are absent from the Rust executable.

For native groups with at least 10,000 classes, Rust builds cyclic and
`C2 x C(h/2)` maps with up to eight OS threads, bounded by the process's
reported available parallelism. Native reduced-form enumeration and scalar
class-number counting also use up to eight workers when the candidate range
has at least 20,000 entries.
For large eligible cyclic fields, the native group route may instead count all
reduced forms, prove a small prime form has full order, and collect its complete
reduced-form orbit in parallel. Eligible odd three-prime-factor fields may
similarly prove a `C2 x C(h/2)` basis from a full-order prime form and an
independent divisor-boundary involution. In each case the count and distinct
orbit prove completeness; fields without the required witnesses use the
general enumerator.
Smaller Rust cases and the Wasm target use one thread. PARI's matched call is
not assigned an equivalent worker pool, so the comparison is wall time, not
equal total CPU work; the receipt records the host's process affinity.

The runner also builds the retained Rust executable twice with `--locked`,
incremental compilation disabled, a fixed `SOURCE_DATE_EPOCH`, and independent
target directories. It refuses to proceed unless both binary SHA-256 hashes
match. Its source-closure digest includes `run.py`, the panel, both Cargo
manifests and lockfiles, all qualification Rust sources, and every reachable
root-crate Rust/C source plus its build script, as well as the shared product
imaginary-quadratic Rust source compiled by the qualification adapter. The receipt records the CPU
model, process affinity, thread-control environment, available governor/power
policy data, and before/after load averages. This host was not externally
isolated, which is disclosed rather than described as quiet.

Run the original panel from this crate with:

```sh
python3 benchmark/run.py
```

Run the extended panel with a separate receipt:

```sh
python3 benchmark/run.py --panel panel-v2.json --receipt receipt-v2.json
```

The v2 selection takes the first primes in fixed residue classes above
specified decimal thresholds. Its even and three-prime-factor branches also
require class number at most 50,000, the Rust engine's predeclared resource
cap. The independent PARI control supplied only class numbers and invariant
factors for selection; no clock was used to choose or exclude a field. The
selection rule, selected primes, and expected exact outputs are recorded in
`panel-v2.json`. The earlier profiled `D=-100000000003` is also excluded.

The authenticated PARI 2.17.4 control must already exist at
`../pari-control/build/pari-control`.

## Public Sage.js latency diagnostic

The promoted comparison above does **not** time `K.class_group()` in the
Python/Sage.js host. For that separate user-facing boundary, build Sage.js and
the native class-group service, then run:

```sh
SAGEJS_CLASS_GROUP_SERVICE="$PWD/packages/class-groups/target/release/class-group-service" \
  node bench/pari-class-group-rust/qualification/public-quadratic-boundary/benchmark/run-public-sagejs.cjs
```

This diagnostic uses the frozen v2 field panel and checks every public answer.
It separately reports the first default call, repeated cached default calls,
fresh explicit Rust-backed groups, and explicit scalar class numbers. Timings
include `sage.evaluate` and public host dispatch but exclude kernel startup and
field construction. Its JSON is **not** a promoted performance receipt and must
not be divided by the PARI timings above: the boundaries and warmup policies
differ. Pass a sample count and field ID to narrow a local investigation, for
example `run-public-sagejs.cjs 3 near-limit-h4378-d8173415`.
Append `--phases` to measure one additional complete Rust-service/host-conversion
call, materialized Python-side validation, and compact Python-side validation
of the same field's map. The diagnostic runs after the public samples, verifies
both form and coordinate counts, and reports the elapsed times separately. It also replays the
checked native packing, isolated kernel, and Python form/coordinate
materialization as separate diagnostic phases. It does not isolate
public group-object binding, alter the frozen matched comparison, or constitute
a release performance receipt.

On 2026-09-25, `larger-composite-d15000000315` (33,768 classes) exposed a
public-path bottleneck: a fresh full group took roughly 7 seconds, while a
cached group took about 8 milliseconds and the explicit scalar call about
14 milliseconds. A phase diagnostic measured about 1.2 seconds for the Rust
service and transport and 6.3 seconds for independent Python-side validation
of the complete JSON map. Extracting all 540,288 numeric fields into one flat
list took about 2.1 seconds; exact type checks over that list took about
1.0 second; native buffer packing and an isolated source-transparent
arithmetic validator took about 0.5 seconds. A production-packed `@native`
prototype still measured a 7.20-second median fresh public call over two
samples, slightly worse than the preceding roughly 6.9-second call, so it was
removed. These are exploratory timings, not a promoted PARI comparison.
They rule out merely compiling the per-row arithmetic as the next speed step:
the public representation must avoid repeated dynamic traversal of the
redundant object graph, or expose a compact/lazy exact map with equally strong
malformed-publication rejection.

A follow-up Node-host transport projects each checked-structure map entry into
one flat integer row before the Sage.js Python container conversion. The same
Python validator checks packed and ordinary responses, while direct host
callers and browser/Wasm retain the original full response. On the same field,
three fresh public calls measured 5.41, 5.67, and 5.60 seconds (5.60-second
median), with exact group and ideal-class checks still enabled. The reduction
is meaningful but leaves a large public-path gap; this diagnostic is not a
matched PARI timing or a promotion receipt.
One-sample public replay across all 11 frozen v2 fields checked every expected
class number and invariant-factor vector. Its single long-lived Node process
ended at about 1.42 GB RSS, so peak memory and repeated-field residency remain
open optimization questions; this is not a Wasm memory claim.

The Node-only compact transport now also packs the independently checked
reduced-form certificate instead of converting its duplicate object list into
Python. The public wrapper exposes ordinary certificate records on demand;
direct host callers and Wasm still receive the full certificate. On this final
version, the same 33,768-class diagnostic measured 5.51, 5.76, and 5.67 seconds
for fresh calls (5.67-second median), too close to the preceding 5.60 seconds
to claim a reliable speedup. A one-sample replay of all 11 frozen fields again
matched every answer and ended near 1.12 GB RSS in the long-lived Node process;
the earlier 1.42 GB observation was from a separate run and does not establish
a controlled memory comparison. Peak Wasm memory remains unmeasured here.

On 2026-09-26, a fresh process measuring the 33,768-class
`larger-composite-d15000000315` row reported 5.58 seconds for one fresh
explicit public group call. An in-process phase probe on that row measured
0.906 seconds for the Rust service plus host conversion, followed by 5.356
seconds in `validate_imaginary_group_result`. A separate three-sample public
run had a 5.46-second fresh-call median after a prototype that emitted flat
rows from Rust, compared with 5.62 seconds after deferring construction of
public form objects. Those are different short runs, not a controlled speedup:
both prototypes were removed because neither addressed the dominant validator
cost. A diagnostic that bypassed only the per-form gcd checks reduced one
validation from 5.347 to 5.046 seconds; the bypass was not retained. The next
public-path optimization must handle independent complete-map validation and
compact exact coordinate lookup together, while preserving forged-publication
rejection, detached certificates, native and Wasm behavior, and arbitrary
ideal-class queries. Merely changing the JSON row shape or delaying public
form objects does not establish PARI competitiveness.
The retained `--phases` mode, run after one public sample of that large field,
reported 0.387 seconds for the warm service/conversion phase and 5.026 seconds
for independent validation. Its boundary differs from the first-call probe,
but confirms which phase dominates after warmup.

A source-transparent packed-map verifier now checks the sorted reduced forms,
certificate, inverse forms, integral ideal representatives, and coordinate
bijection in one isolated native pass. Its ordinary CPython body and emitted
JavaScript path are differential oracles; the prior Python validator remains
the fallback if the compiled kernel is unavailable. On the same large field,
three warm fresh explicit public calls measured 2.650, 2.691, and 2.609
seconds (2.650-second median), versus the preceding source-matched 5.613-second
single fresh call. The phase diagnostic measured 0.355 seconds for service and
conversion and 2.210 seconds for validation including buffer packing and map
materialization. One-sample replay across all 11 frozen v2 fields still
matched every class number and invariant-factor vector; focused counterfeit
and exact ideal-coordinate tests also passed. This is a substantial public-path
improvement, not yet a matched PARI comparison or public PARI competitiveness.
The remaining Python coordinate-dictionary/form materialization and bulk
transport warrant a compact exact lookup design rather than weakened checks.

A subsequent checked signed-64-bit ingress fuses exact-element validation and
buffer packing in the native-kernel host adapter. This is sound for the
quadratic service's bounded discriminant domain; nonintegers, Boolean and
string coercions, and signed-64-bit overflow are rejected before the isolated
kernel receives a row. The compiler's ordinary Python fallback remains
available. On the same 33,768-class field, three warm fresh public calls
measured 1.159, 1.127, and 1.192 seconds (1.159-second median). One phase
probe measured 0.361 seconds for service/conversion and 0.742 seconds for
independent validation; the separate replay measured 0.013 seconds for
checked packing and 0.003 seconds for the isolated kernel. These short runs
show a substantial improvement over the prior 2.650-second three-sample
median, but still do not establish public PARI parity. The remaining
materialization of Python forms and coordinate strings is the next measured
public-boundary target.

The packed verifier can now retain an immutable snapshot of its verified rows
and expose exact read-only form iteration and binary-search coordinate lookup
without constructing one Python form tuple and dictionary entry per class.
Public group construction defers full form-object materialization until a
caller iterates the group; direct validator callers retain the original
materialized result by default, and a host without the compiled verifier uses
the established Python validation fallback. On 2026-09-26, the same 33,768-class
field took 0.411, 0.405, and 0.393 seconds in three warm fresh public calls
(0.405-second median), versus the preceding 1.159-second three-sample median.
The separate phase probe measured 0.354 seconds for warm service/conversion,
0.813 seconds for materialized validation, and 0.037 seconds for compact
validation. All 11 frozen v2 fields returned their expected class numbers and
invariant factors in a one-sample public replay. These are exploratory,
different-run timings, not a promoted matched PARI comparison. The large
fresh-call latency is still much higher than PARI's native coefficient-only
boundary, so public PARI competitiveness remains open.

A private `packed-v1` service transport now streams the same authenticated
class-group map and reduced-form certificate as flat integer arrays directly
from Rust. The ordinary service response remains unchanged; the Node public
route independently validates every packed row before publishing the group.
For `larger-composite-d15000000315`, three warm fresh explicit public calls
measured 0.0933, 0.0947, and 0.0914 seconds (0.0933-second median). The
preceding short run's median was 0.405 seconds, so these exploratory runs
suggest a large transport improvement, not a controlled release comparison.
The separate warm service/conversion probe measured 0.050 seconds; compact
validation measured 0.033 seconds. A one-sample public replay across all 11
frozen v2 fields again returned the expected class numbers and invariant
factors. Exact native ideal-map and counterfeit-publication tests passed.
The matched Rust/PARI coefficient boundary and the public Sage.js boundary
remain different, and public PARI competitiveness is still unproven.

The resident Node worker can now copy its already envelope-validated packed
service response directly into shared memory, avoiding a second JSON
serialization of the full map. On the same large composite field, a fresh
five-sample public baseline before this change measured 0.0924 seconds median;
the source-current 15-sample run measured 0.0844 seconds median. A separate
five-sample phase run measured 0.0479 seconds for warm service/conversion.
These are exploratory different-run observations, not a controlled PARI
comparison or a claim that all of the approximately 8 ms difference is due to
the worker change. The 11-field public answer panel and exact native-map
regressions still pass.

## Matched resident public-call diagnostic

`run-public-sagejs-pari.cjs` adds a separate end-to-end diagnostic against the
authenticated PARI 2.17.4 GP executable. It uses the same frozen 11-field v2
panel, a resident Sage.js process and a resident GP process, one untimed warmup
per arm and field, and 15 alternating samples per arm. GP is pinned to PARI
2.17.4, 192-bit precision, and one thread, matching the authenticated native
control's policy. Both arms start either
from the public polynomial or from a prepared field, include interpreter
evaluation and result projection in the clock, and check the expected field
discriminant, class number, and invariant factors on every sample. Sage.js also checks its
unconditional proof status and Rust route. The Sage.js call authenticates and
retains its complete ideal-class map; PARI additionally computes rank-zero
unit/regulator data but does not project an entire ideal-class map. Different
Node/Sage.js and GP IPC costs remain part of this user-facing diagnostic, so
these are not symmetric algorithmic-kernel timings or a promoted performance
receipt.

```sh
SAGEJS_CLASS_GROUP_SERVICE="$PWD/packages/class-groups/target/release/class-group-service" \
  node bench/pari-class-group-rust/qualification/public-quadratic-boundary/benchmark/run-public-sagejs-pari.cjs \
  --samples 15 --boundary polynomial --receipt public-api-polynomial-diagnostic.json
```

The two source-current 2026-09-26 receipts are
[`public-api-polynomial-diagnostic.json`](public-api-polynomial-diagnostic.json)
and [`public-api-prepared-diagnostic.json`](public-api-prepared-diagnostic.json).
For the polynomial-to-public-group boundary, the geometric-mean ratio of
per-field medians was 22.81 Sage.js/PARI, with a nearest-rank p90 of 43.15 and
every field between 12.86 and 49.36. The prepared-field boundary measured
16.85 geometric mean, 24.33 p90, and an 11.03--36.74 field range. These raw
receipts retain all 15 paired timings per field and the pinned panel, runner,
Sage.js build, service, GP, and libpari hashes. They demonstrate that the
public end-to-end route is **not yet PARI-competitive** under this stricter
resident-process comparison, even though the distinct matched native
coefficient-to-group target passes. No threshold or panel member was changed
in response to these measurements.

## Matched scalar class-number comparison

`run_class_number.py` separately compares the exact scalar Rust count, the
current source-matched Sage.js FLINT `qfbClassNumber` addon, and PARI 2.17.4.
On the original seven-field panel, PARI uses `qfbclassno(D,0)` throughout;
its pinned documentation explicitly guarantees that Shanks routine for
`|D| < 2*10^10`, and every original-panel field is below `10^7`. The Rust
arm starts with the public monic polynomial and repeats validation; PARI and
FLINT start with its equivalent discriminant. All clocks exclude process
startup and JSON serialization, but FLINT's clock includes the Node/N-API
boundary.

The v2 scalar campaign uses the already-frozen, diverse `panel-v2.json`.
Below `2*10^10`, PARI still uses its documented-unconditional Shanks routine.
Above that bound, the PARI arm projects the class number from the same
`nfinit0` plus `bnfinit0(...,0)` public call as the full-group campaign.
That call also computes the full group and, **without `bnfcertify`, is
GRH-conditional**; the Rust scalar count remains unconditional throughout.
Consequently the v2 rows are not a single uniform scalar-to-scalar comparison.
The receipt records the PARI method and computation count for each row. Its
purpose is to expose both the fast Shanks challenge below the threshold and
the public full-group baseline above it, without mislabeling either as an
unconditional PARI oracle.

Build the worktree's FLINT native dependencies and direct addon with
`pnpm --dir packages/flint build:deps` and `pnpm --dir packages/flint build:addon`.
Then run `python3 benchmark/run_class_number.py` for the original panel or
`python3 benchmark/run_class_number.py --panel panel-v2.json --receipt class-number-receipt-v2.json`
for v2. It authenticates the pinned
PARI source and current FLINT addon, builds the Rust and PARI executables,
rotates three arms over 15 samples per field,
checks each class number, and writes `class-number-receipt.json`. That receipt
is diagnostic and explicitly unpromoted; it does not supersede the full-group
receipt or establish a release speed claim. The scalar Rust path now sieves
the candidate norms together, using exact modular square roots to visit only
prime-divisible residue classes and compact linked factor storage to avoid one
factor-vector allocation per candidate. It counts only canonical reduced divisors and uses
the fundamental-discriminant precondition to eliminate redundant primitivity
checks. The retained original enumerator independently agrees on every
fundamental discriminant through 10,000 and a deterministic spread up to the
frozen panel's old `10^7` boundary. On the current host, the diagnostic panel has Rust
faster than PARI on six of seven fields and 1.35 times PARI on the remaining
4,378-class field. This is a substantial scalar improvement, but the receipt
must still be frozen and promoted before making a release speed claim. The
current v2 diagnostic also exposes a substantial slow case at the large
three-prime-factor field; a full-group speed result must not be presented as
proof that scalar counting is uniformly competitive with PARI's Shanks path.

## Frozen panel and large-class-number selection

The panel includes trivial, cyclic, noncyclic, and rank-four groups, plus the
fixed near-limit `D=-9,999,991`, `h=1,715` case. No retained `h=4,352` input was
available. Before any campaign timing, the following deterministic replacement
rule was fixed: in PARI 2.17.4, call `setrand(20260920)`, take at most 50,000
draws of `d=8000000+random(2000001)`, increment each `d` until its residue mod 4
is 0 or 3, discard nonfundamental `D=-d`, and retain the first field for which
`qfbclassno(D)>=4000`. Draw 12 selects `D=-8,173,415`, polynomial
`x^2-x+2,043,354`, with `h=4,378` and cyclic group `C4378`. This oracle was used
only to freeze a benchmark input and expected differential projection.

The panel also froze `D=-9,013,587` as a prospective PARI 5--100 ms member.
Python `Random(20260922)` generated at most 1,000 outer draws in the same
8,000,000--10,000,000 interval, redrawing to an admissible residue, discarding
nonfundamental discriminants, and making one public-call measurement per
survivor. The maximum discovery measurement was 5.234 ms at outer draw 869,
which nominated this field before the campaign. Its independent 15-sample
campaign median determines its actual band. If no field has a 5--100 ms
campaign median, the runner marks that coverage and the corresponding native
target failed/not established; it does not relabel process startup or treat
the slow discovery outlier as campaign evidence.

## Targets

For PARI medians below 5 ms, the tiny-field target is Rust no slower than the
larger of twice PARI or PARI plus 2 ms. For a genuine 5--100 ms member, the
native target requires geometric-mean Rust/PARI ratio at most 1.5, p90 ratio at
most 2, and no individual ratio over 3. The receipt evaluates these rules
literally. If there is no qualifying 5--100 ms field, the native target cannot
pass.

## Tiny batch throughput

The frozen batch campaign runs 15 fresh-process samples for each of the four
structural tiny fields (trivial, cyclic, noncyclic, and rank four), with 100
independent coefficient-only computations per sample. Every computation
reconstructs and verifies the result; there is no memoized answer. This is a
Rust-only throughput measurement, not a Rust/PARI ratio. Measured throughput
belongs only in the generated second-step receipt.

## Promotion workflow

The integration owner must promote evidence in two steps:

1. Commit and freeze the engine, benchmark adapter, runner, panel, both
   manifests/lockfiles, and all other reachable sources, excluding the current
   pre-promotion receipt.
2. From a clean checkout of that frozen commit, rerun `benchmark/run.py` and
   require `promotionEligible: true`, an empty reachable-source status, equal
   independent-build binary hashes, and all exact checks. Commit that generated
   receipt separately as the evidence commit.

Until step 2, the content-addressed receipt is useful diagnostic evidence but
must not be described as bound to or promoted from the dirty `gitCommit` value.
