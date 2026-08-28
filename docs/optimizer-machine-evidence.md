# Optimizer machine-domain evidence

The generated correctness corpus is independent of the five machine-domain
implementations in the parallel compiler program. It feeds ordinary
mathematical source through the public Sage/Python frontend at `O0` and `O2`;
it does not import a domain pass, verifier, lowering, pass ID, or
representation implementation. The same corpus can therefore run on the
frozen baseline, on an individual domain branch, and after integration.

The performance harness has a different job. Its four executable workloads
use public `@optimize` contracts and record the exact expected pass ID. A run
fails before reporting timings if bounded integers, immutable binary64 tuples,
modular batches, or fixed extensions did not select their intended verified
region. The packed-container entry is explicitly `fact-provider-only`; the
harness instead fails if it masquerades as an executable lowering. This keeps
a fast generic or stale route from being reported as evidence for a new pass.

## Generated correctness corpus

`test/optimizer-machine-corpus/corpus.cjs` deterministically generates 25
cases from seed `0x5a6e2026`, with five cases in each domain:

| Domain | Positive coverage | Adversarial coverage |
| --- | --- | --- |
| Bounded exact integers | generated signed operands and safe intermediates | zero trip, values beyond exact JavaScript `Number`, observable sequence reads, and a shadowed `range` parameter |
| Strict binary64 arrays | ordered finite reduction with exact result bits | signed zero, subnormal rounding, infinity, NaN, and list fallback |
| Prime residue batches | disjoint transactional output and reviewed moduli | zero trip, input/output aliasing, the exact-product boundary, and a product outside the `Number` bound |
| Fixed extensions | degrees two, three, and four with distinct irreducible moduli | zero trip and a quadratic parent outside the machine-coordinate bound |
| Packed containers | disjoint signed-int64 buffers and owner-bound views | aliasing, mutation, exact float bits, and a rejected overflowing record write with unchanged storage |

Three independent evaluations must agree exactly:

1. JavaScript `BigInt`, IEEE-754, and polynomial-coordinate reference
   functions compute the checked expected lines.
2. A generated ordinary CPython program recomputes those answers without
   importing Sage.js.
3. The generated Sage source runs at both `O0` and `O2`.

The differential compares decimal exact integers, canonical residues,
power-basis coordinates (or the generic exact field representation when
coordinates are intentionally unavailable), IEEE-754 byte strings, exception
types, callback counts, and post-failure storage. It does not accept display
similarity as a substitute for exact outputs.

Run the focused differential with:

```sh
pnpm build
node --test test/optimizer-machine-corpus/test.cjs
```

The test is discovered as an integration-tier `test.cjs`; no central test
manifest entry is needed.

## Compile, cold, and warm harness

Run all five representative workloads with short correctness-sized inputs:

```sh
node bench/optimizer-machine-corpus/run.cjs --check
```

For a performance capture on an idle host, omit `--check`, select at least five
samples, and write the receipt outside the repository:

```sh
node bench/optimizer-machine-corpus/run.cjs \
  --samples=7 --compile-samples=7 \
  --output=/tmp/optimizer-machine-evidence.json
```

The versioned JSON receipt includes, for every domain:

- the exact output or native-endian binary64 bits and the logical input/output
  size;
- alternating `O0`/`O2` frontend-plus-emitter samples, emitted bytes, and the
  compile-source SHA-256;
- Sage.js session initialization, first evaluation, first-result total, cold
  function execution, and warm function execution samples;
- CPython process total, cold function execution, and warm function execution
  samples;
- O0/O2 and CPython/O2 warm ratios;
- native-resource count deltas around cold and warm execution; and
- every optimizer-reported representation materialization, target boundary,
  copied-byte value, candidate cost, fallback identity, and rejection reason.

The compiler source excludes runtime import statements because imports are
setup, not part of a candidate mathematical region; this also prevents emitted
byte counts from silently including library modules. The one
`from sagejs.compiler import optimize` statement remains while the frontend
authenticates the source contract. After selection, the direct-emitter harness
removes that import and decorator syntax before counting target bytes. Cold
first-evaluation time includes normal imports, setup, input construction,
frontend work, and the first result. Warm samples time only the same
mathematical function call.

`runtime-dependent` remains `runtime-dependent`, and absent accounting remains
explicitly unavailable. The harness never turns logical input bytes into a
claim about copied bytes and never guesses a boundary or materialization count.

The `--check` mode is a correctness and execution-tier smoke run, not a
performance acceptance claim. One baseline run on the 2026-08-28 Linux x64
development host (Node 26.7, AMD EPYC 7B13, three samples, scale 0.05) produced
the following diagnostic medians before the five new plugins were integrated:

| Domain (elements) | compile O0/O2 ms | first result O0/O2 ms | warm O0/O2 ms | CPython warm ms |
| --- | ---: | ---: | ---: | ---: |
| bounded integer (10,000) | 19.78 / 30.82 | 446.6 / 455.1 | 3.620 / 4.039 | 0.263 |
| strict binary64 array (2,500) | 24.76 / 40.58 | 1208.9 / 1176.6 | 113.993 / 119.686 | 0.112 |
| prime residue batch (500) | 40.86 / 40.42 | 454.9 / 425.1 | 1.467 / 1.290 | 0.055 |
| fixed extension (50) | 44.04 / 56.66 | 510.5 / 521.2 | 7.385 / 2.253 | 0.083 |
| packed container (5,000) | 25.93 / 25.79 | 501.7 / 491.3 | 9.280 / 9.097 | 0.306 |

Those values expose the frozen baseline rather than ratcheting it. They are
retained as the pre-integration comparison. Current runs mechanically require
the exact intended route, but no speedup is ratcheted until a reviewed
quiet-host receipt establishes a stable ceiling.

An integrated three-sample `--check` run on the same host selected the exact
required routes and produced these diagnostic warm medians:

| Domain | Authenticated selected route | warm O0/O2 ms | O0/O2 |
| --- | --- | ---: | ---: |
| bounded integer | `math.bounded-integer-region.v1` / V8 | 3.707 / 0.220 | 16.88x |
| strict binary64 tuple | `math.strict-float-array-region.v1` / V8 | 1.397 / 0.673 | 2.08x |
| prime residue batch | `math.modular-batch-region.v1` / V8 | 15.707 / 0.520 | 30.23x |
| fixed extension | `math.fixed-extension-region.v1` / adaptive | 12.919 / 2.988 | 4.32x |
| packed container | fact provider only; no executable route | 9.121 / 9.329 | 0.98x |

These short runs establish route and exactness evidence, not stable performance
ceilings. In particular, tuple conversion dominates the smallest strict-float
workload, and the packed-container row is intentionally a no-speedup control
until a mathematical pass consumes its ownership and layout facts.

Use `--domains` to isolate a comma-separated subset, and `--scale` to change
workload sizes without changing mathematical shape:

```sh
node bench/optimizer-machine-corpus/run.cjs \
  --domains=strict-binary64-array,fixed-extension --scale=2
```

## Cubic class-group and PARI adapters

The held-out workload remains owned by `origin/class-group`. This lane does not
copy its class-group source or make the profiler part of the optimizer. The
harness instead accepts the two receipts produced by that branch.

From a built checkout of `origin/class-group`, capture the authentic cubic
boundary profiler. Run the default native target and the generated-JavaScript
negative control separately:

```sh
SAGEJS_USE_SOURCE=1 SAGEJS_OPT_LEVEL=O2 \
  SAGEJS_CUBIC_PROFILE_SAMPLES=7 \
  node bin/sagejs --python \
  bench/class-unit-groups/cubic-compiler-boundaries.py \
  > /tmp/cubic-native.txt

SAGEJS_USE_SOURCE=1 SAGEJS_OPT_LEVEL=O2 \
  SAGEJS_CUBIC_PROFILE_SAMPLES=7 \
  SAGEJS_CUBIC_KERNEL_TARGET=javascript \
  node bin/sagejs --python \
  bench/class-unit-groups/cubic-compiler-boundaries.py \
  > /tmp/cubic-javascript.txt
```

Capture the matched persistent Sage.js/Sage-PARI cubic corpus in the same
checkout:

```sh
pnpm bench:number-field-class-number-lmfdb -- \
  --samples 7 --proof both --require-sage \
  --output /tmp/lmfdb-class-number-timings.json
```

Then attach either cubic target and the PARI evidence to a machine-domain
receipt:

```sh
node bench/optimizer-machine-corpus/run.cjs --check \
  --cubic-profile=/tmp/cubic-native.txt \
  --pari-evidence=/tmp/lmfdb-class-number-timings.json \
  --output=/tmp/optimizer-machine-with-cubic.json
```

The cubic adapter accepts either the raw profiler output ending in `RESULT` or
the extracted JSON object. It preserves each named profiler boundary as an
inclusive, possibly nested measurement and never adds their times. The v1
profiler does not report copied bytes or materialization counts, so the adapter
records both as unavailable. It also preserves the call-only and fresh-buffer
inclusive native/generated-JavaScript kernel evidence and exact metadata.

The PARI adapter accepts
`sagejs.number-fields/lmfdb-class-number-benchmark-v1`, preserves exact class
numbers and proof modes, and records same-boundary warm Sage.js/PARI times,
ratios, dominant Sage.js phases, and separate persistent-process totals. A
missing Sage/PARI process remains `unavailable`; it is never replaced by a
different comparator.

The current generated-JavaScript cubic candidate is a required negative
control: on the originating branch it was about 26 times slower call-only than
the native kernel. An integrated bounded-integer pass must demonstrate a new
proved representation and an authentic end-to-end improvement; merely
renaming or selecting that fallback is not evidence of optimization.

## Integrated evidence contract

The executable catalog now contains four relevant passes: bounded exact
integers, strict binary64 immutable tuples, complete modular batches, and fixed
extensions. The packed-container analyzer lives in the separate immutable
fact-provider catalog because it proves representation boundaries for future
consuming passes and does not itself own mathematical semantics or a fallback.

Every harness receipt includes both a stable mathematical domain ID and
`expected_pass_id`. Route verification happens before execution timing is
accepted. Integration validation therefore consists of:

1. running the implementation-independent 25-case corpus at `O0` and `O2`;
2. requiring the four exact executable pass IDs and no fake packed-container
   lowering in the compile/cold/warm harness;
3. inspecting representation, target, fallback, and accounting records;
4. capturing an idle-host receipt plus both cubic target receipts and matched
   Sage/PARI evidence; and
5. setting platform-specific ceilings only from those reviewed receipts.
