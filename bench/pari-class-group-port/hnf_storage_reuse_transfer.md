# HNF storage-reuse transfer

## Question

Does the explicit bounded-storage result from the splitting-degree experiment
transfer to real exact HNF arithmetic?  The narrow experiment below holds the
input and FLINT algorithm fixed and changes only ownership of the result
matrix:

- `fresh`: initialize a result matrix, call `fmpz_mat_hnf`, verify it, and
  clear it on every iteration;
- `reuse`: initialize and warm one result matrix, then call `fmpz_mat_hnf`
  into that same matrix on every iteration.

This isolates destination reuse.  It does not claim to reuse FLINT's private
algorithmic scratch.

## Reproduction boundary

The benchmark source was `/tmp/hnf_reuse_bench.c`, SHA-256
`41c70e9c38a0303e4da6e5e71f02386c45a5f79deda37cb8925d3f9dab60c9d4`.
It used the Sage.js FLINT 3.6.0 static prefix from
`packages/flint/.native/prefix`, was compiled with `cc -O3 -DNDEBUG`, and was
linked statically against the prefix's FLINT, MPFR, GMP, and OpenBLAS archives.
The linker wrapped `malloc`, `calloc`, `realloc`, and `free`, including calls
from the static libraries.  Runs used `OPENBLAS_NUM_THREADS=1`.

The essential measured loops were:

```c
for (i = 0; i < reps; i++) {
    fmpz_mat_init(fresh, rows, cols);
    fmpz_mat_hnf(fresh, source);
    if (!fmpz_mat_equal(fresh, reference)) abort();
    fmpz_mat_clear(fresh);
}

fmpz_mat_init(reused, rows, cols);
fmpz_mat_hnf(reused, source); /* warm retained entry capacity */
for (i = 0; i < reps; i++) {
    fmpz_mat_hnf(reused, source);
    if (!fmpz_mat_equal(reused, reference)) abort();
}
```

Each input was a deterministically seeded dense integer matrix.  A separately
computed reference HNF was compared exactly on every iteration.  Both modes
also accumulated the same result entry into a printed checksum, so the result
could not be dead-code eliminated.  Nine fresh processes were measured.  The
microbenchmark ran `fresh` before `reuse` within each case, so sub-percent
timing differences should be treated as directional rather than an acceptance
threshold.

The compile/run shape was:

```sh
cc -O3 -DNDEBUG -I$PREFIX/include /tmp/hnf_reuse_bench.c \
  -Wl,--wrap=malloc -Wl,--wrap=calloc \
  -Wl,--wrap=realloc -Wl,--wrap=free \
  $PREFIX/lib/libflint.a $PREFIX/lib/libmpfr.a \
  $PREFIX/lib/libgmp.a $PREFIX/lib/libopenblasp-r0.3.33.a \
  -lm -lpthread -ldl -o /tmp/hnf_reuse_bench
for run in $(seq 1 9); do
  OPENBLAS_NUM_THREADS=1 /tmp/hnf_reuse_bench
done
```

## Results

Times are pooled means over the nine processes.

| rows x columns | input bits | repetitions/run | fresh, us/HNF | reused, us/HNF | reused/fresh | improvement |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 16 x 3 | 24 | 3,000 | 5.2070 | 5.0998 | 0.97941 | 2.06% |
| 64 x 3 | 64 | 1,000 | 16.7229 | 16.5801 | 0.99146 | 0.85% |
| 16 x 8 | 24 | 500 | 21.6698 | 21.5846 | 0.99607 | 0.39% |
| 32 x 12 | 48 | 120 | 87.6982 | 86.8341 | 0.99015 | 0.99% |
| 64 x 16 | 64 | 30 | 304.5386 | 301.2576 | 0.98923 | 1.08% |

Allocation counts explain the small timing effect.  For the 16 x 3 case,
each fresh HNF averaged two `malloc`, two `calloc`, four `free`, and essentially
no `realloc` calls.  Reuse averaged the same two `malloc`, but only one
`calloc` and three `free`.  For one 30-call 64 x 16 run, fresh versus reuse was:

| mode | malloc | calloc | realloc | free |
| --- | ---: | ---: | ---: | ---: |
| fresh | 90 | 60 | 250 | 150 |
| reuse | 90 | 30 | 10 | 120 |

Thus destination reuse reliably removes one allocation/free pair per call and
nearly all result-entry limb growth.  It does **not** remove FLINT's remaining
per-call HNF allocations, and exact arithmetic dominates elapsed time at these
sizes.

## Existing authentic class-group evidence

This narrow result is consistent with the stronger production experiment in
`bench/class-unit-groups/RESIDENT-HNF.md`.  The readable typed-Python selector
in `src/lib/sagejs/kernels/matrix/class_group_hnf.py` keeps the source, HNF,
transform, trial source, and trial HNF matrices resident across exact replay
and deletion trials, using `fmpz_matrix_hnf_into` rather than publishing and
repacking each intermediate.

That experiment reports the unconditional discriminant-4027 selector falling
from 57.8 ms to 24.2 ms and its whole scalar computation from 452.3 ms to
407.9 ms.  Its benefit is much larger than the isolated 0.4--2.1% above
because residency also removes repeated boundary packing/publication and
shares storage across non-overlapping pipeline lifetimes.  It verifies the
canonical HNF lattice, exact transform replay, determinant, retained lattice,
and public class-group certificate; it is not merely a synthetic allocation
test.

## Conclusion

Explicit storage reuse **does transfer safely to HNF**, but destination reuse
alone is a small optimization.  Sage.js already has the right public primitive
(`fmpz_matrix_hnf_into`) and uses it in the resident class-group selector.
The high-value generalization is to keep complete exact workflows resident and
reuse matrices across phases.

For a splitting-degree-sized gain inside HNF itself, the next boundary would
have to include algorithm-internal scratch.  FLINT exposes no public reusable
HNF context in this build: `fmpz_mat_hnf` still allocates internal temporaries
on every call.  The credible choices are therefore to add an upstream-quality
FLINT workspace API, or to implement a bounded HNF kernel over compiler-owned
exact storage.  Merely replacing allocating HNF calls with `*_into` should not
be expected to close a substantial performance gap.
