# Direct LLVM splitting-catalog experiment

## Question

Can the benchmark-local compiler bypass generated C, lower the same readable
Python splitting-degree graph directly to LLVM IR, and improve either runtime
or compilation behavior?

This experiment uses the existing frozen catalog for
`x^3 - 20018*x + 20034`: 1,230 primes and 7,081 active output values.  The
mathematical graph consists of 46 functions selected from eight ordinary
Python source files.  The direct-LLVM arm parses those Python files and does
not read generated C.  A 9,737-byte C harness constructs the fixed buffers,
clocks the call, and prints its output; that work is outside the kernel timer.

The experimental emitter is
[`generate_same_storage_catalog_llvm.py`](generate_same_storage_catalog_llvm.py).
It supports only the already declared benchmark sublanguage.  It is not a new
production backend.

## Correctness result

All five arms produced the same complete output byte-for-byte:

- compact C compiled by GCC 15.2;
- compact C compiled by Clang 21.1;
- baseline direct LLVM IR;
- direct LLVM with admitted `inbounds`, nonthrowing-function, and signed
  no-overflow facts; and
- the preceding facts plus disjoint top-level buffer parameters.

The normalized 7,081-value output has SHA-256
`fae750ef6a9451595b4dbe2f80594f7fc8c5c23a19bf40835b5a217912f31ce9`.
The reproducible runner is
[`run_same_storage_catalog_llvm_experiment.cjs`](run_same_storage_catalog_llvm_experiment.cjs).

## Runtime result

The shared-host diagnostic used three warmup batches followed by ten rotated,
alternating batches of 800 complete catalogs per arm.  Affinity and an idle
host were not established, so these remain unqualified development timings.

| arm | geometric mean ms/catalog | ratio to GCC |
| --- | ---: | ---: |
| compact C / GCC | 1.37842 | 1.0000 |
| compact C / Clang | 1.46073 | 1.0597 |
| direct LLVM baseline | 1.49621 | 1.0855 |
| direct LLVM with proved arithmetic/storage facts | 1.47876 | 1.0728 |
| proved facts plus top-level `noalias` | 1.52312 | 1.1050 |

The direct backend therefore works, but it does not improve this kernel.  Its
best arm is about 7% slower than compact C compiled by GCC.  The admitted
`inbounds`/overflow facts recover a small amount of time; adding valid
top-level `noalias` changes optimization and code layout in an unfavorable
way.  More facts are not automatically better target code.

## Small-graph compilation result

| arm | source/IR bytes | compilation | object bytes |
| --- | ---: | ---: | ---: |
| compact C / GCC | 79,422 | 1.45 s median in a seven-build focused sample | 65,480 |
| compact C / Clang | 79,422 | 1.25 s median | 63,800 |
| proved direct LLVM / Clang | 295,202 | 1.61 s median | 43,024 |

The direct emitter deliberately uses simple alloca-based textual IR and lets
LLVM promote it.  Its textual output is 3.7 times the compact C size.  Although
its object is smaller, it also takes longer to parse and optimize.  Direct
textual LLVM is consequently not a compilation-latency win for this graph.

## Existing 112 MB row-6 core under Clang

The already frozen row-6 arena artifact provides a separate large-module
test.  It contains the same 111,806,904-byte `kernel_core.c` described by the
prepared-boundary audit.  Compiling its 4,038,169-byte Node adapter, which
includes that core, under otherwise matched `-O3`, section-splitting, floating
contraction, PIC, and frame-pointer flags gave:

| compiler | compile wall | object bytes | linked addon bytes |
| --- | ---: | ---: | ---: |
| GCC 15.2 historical frozen build | about 435 s including link | 24,122,536 | 17,464,128 |
| Clang 21.1 replay | 269.653 s plus 0.202 s link | 19,887,240 | 13,757,224 |

The Clang object SHA-256 is
`be2b53c8139454a53f5fde881bef9033b6294187a9d8fd3712b55c04f0f1f330`;
the linked addon SHA-256 is
`76ab4a6d15b2342a12d132c4e99f86d44f809aa783075e989c96727ed38bbece`.
It loads under Node and has exactly the same 832 own native properties as the
GCC addon.

During compilation, direct process samples observed Clang RSS grow from about
803 MB to about 1.10 GB.  The historical GCC build observed `cc1` near 2.34 GB
and approximately 3.20 GiB across the process tree, but its detached monitor
was lost.  Neither observation is a qualified peak-memory receipt and they
must not be represented as one.

The large-module result is nevertheless useful: using Clang on the existing C
backend reduces wall time by about 38%, the object by about 18%, and the linked
addon by about 21%.  This does not validate mathematical execution of the
compile-only row-6 arena artifact.

## Decision

The experiment does **not** justify replacing the compact C backend with
direct LLVM:

1. direct LLVM is about 7--9% slower on the decisive catalog;
2. its naïve textual IR takes longer to compile; and
3. the dominant 112 MB pathology originates upstream: 414 exact functions
   become roughly 828 native and 824 tagged bodies before either C or LLVM
   receives the program.

It does justify two narrower conclusions:

1. LLVM is a viable optional target for the typed Python subset—the entire
   46-function graph lowers directly and agrees exactly; and
2. Clang is a promising compiler for unusually large generated-C modules,
   independently of whether a direct LLVM backend is developed.

The next compiler priority remains reachable-representation selection,
private-function export elimination, and controlling word-specialization
expansion.  Those changes benefit both GCC and LLVM.  After the closure is
compact, an LLVM backend can be reconsidered using the same differential
runner rather than assumed to be faster.

## Frozen development receipt

The complete replay is retained outside project backups at:

```text
/scratch/sagejs-direct-llvm-catalog-replay-current-20260919/result.json
```

Its SHA-256 is
`197e35c4ae0ed439143dace95612c5538b931ec51b6cd3ef205cf8935dc91539`.
Generated artifacts are disposable and can be recreated from the two checked
in generators and the authenticated analytic fixture.
