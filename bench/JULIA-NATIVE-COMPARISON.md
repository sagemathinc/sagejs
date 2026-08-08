# Julia and Native Kernel comparison

This benchmark compares warmed Julia 1.12.6 code with Sage.js Native Kernel
v7 on the same dedicated 16-vCPU AMD EPYC 7B13 VM. It is intended to answer
two separate questions:

1. How does the typed native subset compare with a mature numerical JIT?
2. Are its results an artifact of compiling generated C with GCC?

The Julia source is [`julia-math-comparison.jl`](julia-math-comparison.jl).
It implements the same loop bounds, constants, algorithms, precision, and
checked results as the Sage.js benchmarks. Run it with:

```sh
pnpm run bench:native:julia
```

Julia's JIT compilation and Sage.js's AOT compilation are both excluded from
the steady-state rows. Every operation is warmed first and the tables report
the median of seven samples. All runtimes use one thread. The measurements
below were made on 2026-08-08 with Node 26.7.0, Julia 1.12.6, CPython 3.12.3,
GMP 6.3.0, MPFR 4.2.2, GCC 13.3.0, and Clang 18.1.3.

## Word and arbitrary-precision integer kernels

Times are milliseconds per complete operation:

| Workload | Julia | Sage.js/GCC | Sage.js/Clang |
|---|---:|---:|---:|
| 100,000 small GCDs | 4.477 | 4.801 | 5.094 |
| 100 GCDs of 314-digit integers | 35.547 | 10.314 | 9.319 |
| recursive Fibonacci, `n=30` | 5.003 | 5.755 | 6.743 |
| prime counting through 100,000 | 2.830 | 2.087 | 1.792 |

The first and third rows stay in a machine word in both systems; Julia is
7--26% faster there. The large-GCD row starts in GMP and Sage.js is 3.4--3.8x
faster because its generated kernel reuses native GMP storage instead of
allocating Julia `BigInt` results around each operation. Sage.js is 1.4--1.6x
faster on the multi-function prime-counting module.

Neither system can use an unchecked machine `Int` when mathematical integers
must remain exact. Julia's normal `Int` arithmetic wraps silently: the
four-million-term quadratic sum returns `-2886581259620448384` instead of the
correct `-21333325333330000000`. The exact alternatives were:

| Exact overflow policy | Time | Allocation per Julia call |
|---|---:|---:|
| Julia `BigInt` from entry | 1,829.370 ms | 960,014,488 bytes |
| Julia explicit checked word, then `BigInt` | 68.711 ms | 70,227,632 bytes |
| Sage.js automatic word/GMP resume, GCC | 17.688 ms | native scratch storage |
| Sage.js automatic word/GMP resume, Clang | 18.333 ms | native scratch storage |
| Sage.js forced GMP, GCC | 84.253 ms | native scratch storage |
| Sage.js forced GMP, Clang | 82.905 ms | native scratch storage |

The explicit Julia implementation is the semantically relevant comparison:
it uses `Base.Checked.add_with_overflow`, promotes exactly once, and never
restarts the function. Native Kernel v7 implements that policy automatically
from the annotated Python function and is 3.7--3.9x faster here because its
post-promotion operations mutate reusable GMP temporaries.

## MPFR kernel

The 400-term harmonic-cubic sum uses 269-bit `BigFloat`/MPFR arithmetic and
checks the same 60 decimal digits as the mpmath workload:

| Implementation | Time | Allocation per Julia call |
|---|---:|---:|
| Julia idiomatic allocating `BigFloat` | 0.401 ms | 201,968 bytes |
| Julia explicit in-place MPFR `ccall` | 0.171 ms | 23,104 bytes |
| Sage.js AOT/MPFR, GCC | 0.128 ms | native scratch storage |
| Sage.js AOT/MPFR, Clang | 0.133 ms | native scratch storage |
| CPython mpmath | 2.110 ms | not measured |
| interpreted Sage.js mpmath | 29.800 ms | not measured |

The in-place Julia row is intentionally low level: it calls `mpfr_set_ui`,
`mpfr_pow_ui`, `mpfr_div`, and `mpfr_add` directly. This is the closest Julia
ceiling to the generated Sage.js C, rather than a claim that ordinary Julia
users write that code. The Sage.js AOT kernel is 1.3x faster than this explicit
implementation and 3.1x faster than idiomatic allocating `BigFloat`.

## GCC versus Clang

The same generated C was compiled independently with `CC=gcc CXX=g++` and
`CC=clang CXX=clang++`. Separate cache roots were used for this v7 measurement,
and ELF object metadata was inspected after the run to verify the compiler
actually used. Native Kernel v8 now includes compiler identity and effective
flags in the cache fingerprint.

Neither compiler dominates: GCC wins small GCD, recursion, overflow resume,
and MPFR by 3--15%, while Clang wins large GCD and prime counting by 10--14%.
Those differences are much smaller than the representation and allocation
effects under study. The Native Kernel results therefore do not depend on a
special GCC advantage.

The benchmark runners accept isolated cache directories for reproducing this
comparison:

```sh
CC=gcc CXX=g++ \
  SAGEJS_NATIVE_COWASM_CACHE_ROOT=/tmp/sagejs-gcc \
  pnpm run bench:native:cowasm

CC=clang CXX=clang++ \
  SAGEJS_NATIVE_COWASM_CACHE_ROOT=/tmp/sagejs-clang \
  pnpm run bench:native:cowasm
```

`SAGEJS_NATIVE_INTEGER_CACHE_ROOT` and
`SAGEJS_MPMATH_AOT_CACHE_ROOT` provide the equivalent isolation for their
benchmark runners.
