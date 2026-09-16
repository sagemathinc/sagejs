# Checked word conversion after arena reuse

Compiler dependency `4a1987da6f030764a212136f7b15af13bf0aacc0` replaces
size/export conversion of single-limb exact integers with public GMP limb
access when `GMP_NUMB_BITS == 64`. Signed limits, `INT64_MIN`, negative unsigned
rejection and unchanged output on failure are preserved. Other limb layouts
retain the existing export path. No `unsigned long == uint64_t` assumption is
introduced; actual Windows and 32-bit-limb execution remain unqualified.

The independent conversion harness checks 158,671 values, including exhaustive
small signed integers, power-of-two boundaries through 256 bits and randomized
magnitudes through 4,096 bits. Optimized/UBSan checks, forced export fallback,
independent GMP reconstruction, and five generated-kernel tests pass. Forced
fallback on this host is not a 32-bit ABI test. The small-index primitive
benchmark falls from about 14 ms to 2.2 ms per million conversions; that result
alone does not predict the complete workload gain.

## Caller evidence

`count_gmp_callers.cjs` relinks a **copy** of the previous frozen `kernel.o`
with GNU linker wrappers, preserving original GMP arguments and return values.
The original cache is never modified. Every owner and the mathematical entry
comes from the same relinked addon. Bounded thread-local counters bracket the
original probe invocation; empty, known-call and exception/recovery controls
pass. `gmp-conversion-callers-20260915.json` retains object/wrapper/addon hashes,
mapping information, counts and full mathematical assertions.

Each of two windows records 1,030,706 `sizeinbase` calls and 647,137 exports,
with zero dropped/saturated counters. The following callers each issue both
operations the indicated number of times:

| Caller symbol | Calls per operation |
| --- | ---: |
| `sagejs_mpz_integer_buffer_index` | 369,787 |
| `sagejs_mpz_buffer_index` | 77,177 |
| `mpz_to_int64` | 84,786 |
| `sagejs_integer_buffer_set_mpz` | 67,683 |

These are counts at wrapped relocations, not all possible internal GMP calls,
inclusive stacks or timing fractions. Sized ELF attribution uses return
address minus one; tail calls can identify an outer caller. The two named index
helpers concretely establish an important source of conversion traffic without
attributing all sampled GMP time to indexing.

## Full prepared computation

`word-conversion-first-20260915.json` records the successful rebuilt native core,
SHA-256 `37035c60b360c8bae1aa095646b7712c2788fd2daf5f9eda254e003f297b00f1`.
It has 58,295,778 bytes; rebuilding consumed 329.404 CPU seconds and peaked at
3,355,464 KiB child RSS under the unchanged 4 GiB address-space limit. Class
number 3, invariant factors [3], exact regulator, 58 relations and work counts
491/54/12 all match. Both actual same-source JavaScript entries also pass.

`compare_prepared_artifacts.cjs` alternates frozen old/new artifacts in separate
child processes, constructing fresh owners in each addon domain. It retains
the original probe's reset and exact assertions. Module, core, addon, manifest,
build recipe, input, reference and probe hashes are checked. Both full
mathematical IR closures are equal, with common JSON SHA-256
`374adc2f2163467772d7e83ec27b745bd58ee38cefad1397b798918741272f90`.
The build recipes are byte-identical. Recompilation alone is bypassed; no
mathematical implementation is substituted. An identical-artifact smoke test
passed before the old/new run; its concurrent-build timings are not evidence.

`word-conversion-paired-20260915.json` records CPU 15, one BLAS thread, three
alternating pairs and 20 fresh calls per sample, with one excluded warmup.
All six samples exceed one second. Setup and owner resets are separate from
kernel totals; there is no new matched PARI timing in this experiment.

| Pair | Previous arena ms/call | Fast conversion ms/call | New / old |
| --- | ---: | ---: | ---: |
| 1 | 90.213 | 83.609 | 0.927 |
| 2 | 89.251 | 83.373 | 0.934 |
| 3 | 89.209 | 83.017 | 0.931 |

The geometric-mean ratio is 0.930501: **6.95% less kernel time**. This is a
one-field shared-host diagnostic, not whole-engine or cross-platform parity.
The known stale optimizer-manifest architecture failure remains visible.
Public dispatch and mathematical bounds are unchanged. The substantial
remaining gap and the nfinit-only preparation boundary remain open.

Reproduce from archived first-run reports with:

```
node bench/pari-class-group-port/compare_prepared_artifacts.cjs OLD_REPORT NEW_REPORT INPUT_JSON REFERENCE_JSON CPU
```

Exact cached artifacts must still exist at their recorded paths; missing or
changed artifacts fail closed rather than silently rebuilding a different
baseline. Artifact hashes are checked again in every child.
