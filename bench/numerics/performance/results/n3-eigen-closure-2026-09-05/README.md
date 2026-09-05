# Eigen 5.0.0 dependency-closure probe

This is a **build and tiny mathematical smoke probe**, not a backend selection,
speed claim, production integration or independent correctness qualification.
Eigen is not installed as a Sage.js dependency by this work.

## Pinned inputs

- [Official Eigen 5.0.0 archive](https://gitlab.com/libeigen/eigen/-/archive/5.0.0/eigen-5.0.0.tar.gz)
- Archive SHA-256: `315c881e19e17542a7d428c5aa37d113c89b9500d350c433797b730cd449c056`
- Sorted 408-file `Eigen/` header snapshot: `7483cda9cd8dd601b66409775d1548969e8ce8f136ed1f9df41871cb60f9a21c`
- First-party probe SHA-256: `0dc3046e9ded859180fce8ae0ac1888036779975f2a0c07f5e3e5480f0b1ad34`

The [upstream overview](https://libeigen.gitlab.io/) identifies Eigen 5 as a
C++14 header-only library with no dependency beyond the C++ standard library.
The downloaded `COPYING.README` identifies MPL2 and compatible third-party
licenses. The probe defines `EIGEN_MPL2_ONLY` and disables internal parallelism;
actual packaging would still need full license/notice and redistribution review.

## Observations

All four persistent native hosts build and run the same LU, Householder QR,
Cholesky, symmetric eigensystem and Jacobi SVD closure. Windows uses native
Visual Studio, not WSL or MinGW. Tests check a small known solve, reconstruction,
and a rectangular matrix with known singular values. Reconstruction uses Eigen
itself and is explicitly not an independent broad oracle.

| Target | Fresh compile (s) | Executable bytes |
| --- | ---: | ---: |
| Linux x64 | 13.73 | 383216 |
| Linux ARM64 | 18.30 | 375304 |
| macOS ARM64 | 15.79 | 413528 |
| Windows x64 | 30.62 | 407040 |

These development build times are not solver performance measurements. The
native collector records commands/flags, not complete compiler/runtime
distribution identities; these receipts are insufficient for reproducible
product qualification.

The same source compiles with the current WASI SDK and runs twice in each of
Chromium, Firefox and WebKit. The reactor is 413412 bytes, 118932 gzip bytes,
including its runtime closure. This is not a projected incremental package size.
Its three WASI I/O imports throw if invoked: no host I/O occurs on these
successful calls. No exact-arithmetic library is linked.

The initial exceptions-enabled Wasm link failed with unresolved C++ exception
symbols. `-fno-exceptions` builds and runs, but **does not qualify allocation
failure, failure recovery, cancellation or production memory ownership**. A
production adapter must explicitly resolve these concerns; do not hide them
behind the successful smoke.

## Reproduction and remaining gates

Extract the pinned archive into an isolated directory, then run:

```sh
node bench/numerics/performance/eigen-probe.cjs EIGEN_SOURCE NEW_OUTPUT_DIRECTORY
node bench/numerics/performance/eigen-wasm-probe.cjs EIGEN_SOURCE NEW_OUTPUT_DIRECTORY
```

Collectors refuse existing output directories. No download or installation is
implicit. The Wasm collector uses the repository's existing pinned SDK and
Playwright engines. Native source/header and collector hashes match across the
four receipts; browser source/header hashes match them too.

Before selection: compare matched LU/QR/Cholesky/eigen/SVD workloads with the
typed-source candidates and LAPACK/SciPy, establish input/shape/conditioning
envelopes, independent residual/invariant-subspace oracles, and failure/memory
contracts. The current declared-FFI catalogue has no `Float64Buffer` slice
declaration; add and test a generic typed boundary if needed, rather than
encoding doubles as integer residues or adding handwritten Node-API math.
