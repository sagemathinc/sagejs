# Bounded-storage Flx experiment

This is a diagnostic language experiment, not a production optimization or a
qualified class-group timing. It compares the existing exact `IntegerBuffer`
translation of PARI 2.17.4's small `Flx_mul`/`Flx_sqr` schedule with the
`UInt64Buffer` candidate in `flx_word_experiment.py`. The mathematical schedule,
tail clearing, coefficient order and high-bit reduction rule are unchanged.
PARI's pinned source SHA-256 is recorded in that attributed Python source.

The checker covers 2,772 canonical and adversarial multiply/square cases. It
uses degrees -1 through 4 and primes 3, 5, 101, 65,537, 2,147,483,659 and
3,037,000,493. Dense `p-1` coefficients exercise the high-bit reduction path;
sparse, alternating and deterministic pseudorandom polynomials exercise leading
zeros and different convolution intervals. Every result agrees between the
exact baseline and word candidate in CPython, generated JavaScript, native GMP
and native tagged execution. Each compiled case also checks unchanged inputs and
a sentinel beyond the fixed output slot.

Run the complete check under the experiment's existing resource policy:

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  prlimit --as=4294967296 timeout 600s \
  node bench/pari-class-group-port/check_flx_word_experiment.cjs
```

The checked source SHA-256 is
`1bac3446aa92b350dc4c6270a57cb0cb3a6e47b4ce9a983fa213826f12503f0b`.
The cached generated core is 1,119,144 bytes, SHA-256
`eb739f06e9b49373243f8e824db69b1f91d4b5a58d359fc11c42e18a44ee6633`;
the loaded addon SHA-256 is
`3faaa3f032bcb18538a7f4c77759dd59462456177f1aba38fe1e35892364f550`.
The case and exact-output hashes are respectively
`7d98656cef910cd6ae187f858d0d8b1808ff2632bb23c42b590626afc1bf7151`
and `645dd46ef6aba45b33efdf2370aaeb4ed91520323b141e3e94c0e1100afc9a82`.

## Generated-C result

The generated candidate functions really do use `sagejs_uint64_buffer`, a
`uint64_t` modulus and `uint64_t` coefficient accumulators. Explicit bounded
coefficient storage therefore survives lowering.

It does **not** produce a GMP-free word kernel. The source intentionally leaves
signed degrees, indices and return values as ordinary Python `int`, because -1
is the canonical empty-polynomial degree. Those values become exact integers:

| Generated function | Body bytes | `uint64_t` tokens | GMP/helper calls |
| --- | ---: | ---: | ---: |
| `flx_word_mul` | 48,791 | 19 | 174 |
| `flx_word_sqr` | 45,140 | 24 | 151 |
| `flx_word_batch` | 10,059 | 16 | 18 |

The calls include initialization/cleanup, comparisons, additions and conversion
of exact indices to machine indices. Square also contains exact division,
remainder and multiplication. The check extracts balanced generated function
bodies rather than searching the whole core, and publishes both counts and the
unique call names. Its explicit `zeroGmpCriterion` is false.

This is a concrete compiler/language boundary: annotating coefficients and the
modulus is insufficient. A genuinely GMP-free version needs a safe signed
machine scalar (or an equally explicit representation of the -1 sentinel) for
degrees and indices. Silently mapping ordinary `int` to wrapping machine
arithmetic would change Python semantics and is not an acceptable conclusion.

After running all semantic and timing checks, the checker can make this negative
criterion an explicit failing gate with `--require-zero-gmp`. The default run
publishes the complete negative result successfully; strict mode currently exits
nonzero with a precise unresolved-capability message.

## Interleaved warm diagnostic

The benchmark performs 20,000 iterations per sample, each iteration executing
one degree-four multiply and one square at `p=3,037,000,493`. It uses two warmup
calls and seven alternating exact/word pairs per backend. Checksums agree in
every pair. These short, shared-host samples are diagnostic only: no CPU pinning,
one-second minimum, confidence interval, allocation counter or PARI stage timing
is claimed.

| Backend | Exact geometric mean | Word geometric mean | Word / exact |
| --- | ---: | ---: | ---: |
| CPython | 231.279 ms | 226.957 ms | 0.9813 |
| JavaScript | 578.538 ms | 1,292.860 ms | 2.2347 |
| Native GMP | 155.555 ms | 94.951 ms | 0.6104 |
| Native tagged | 86.454 ms | 4.243 ms | 0.04908 |

Thus the candidate is about 1.64 times faster than the exact GMP baseline and
20.4 times faster than the exact tagged baseline in this microbenchmark. It is
about 2.23 times slower in generated JavaScript, where word-buffer operations
still use dynamic BigInt semantics. CPython's annotations are aliases and the
two paths are essentially equal, as expected.

The tagged result shows that the same readable Python schedule can become a
very fast bounded computation when small signed values stay in an immediate
representation. The GMP result simultaneously shows why bounded coefficients
alone do not close the native GMP gap: degrees and indexing still repeatedly
enter arbitrary-precision machinery. Neither result by itself predicts the
full 1,230-prime degree catalog; the next integration experiment must retain its
actual control flow and output while replacing all proven-bounded scalar state.
