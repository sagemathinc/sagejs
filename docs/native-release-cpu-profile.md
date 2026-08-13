# Native release CPU profile

Official Sage.js artifacts use a declared CPU-breadth contract. This contract
is independent of the Linux libc baseline: libc controls which operating-system
installations can load an artifact, while the CPU profile controls which
processors may execute it safely.

| Target | Compiler baseline | Optimized dispatch |
|---|---|---|
| Linux x64 | x86-64-v1 (`-march=x86-64 -mtune=generic`) | GMP fat binary; OpenBLAS `DYNAMIC_ARCH` with an explicit SSE2 Opteron kernel, its implicit Prescott kernel, and selected newer kernels |
| Linux arm64 | Armv8-A (`-march=armv8-a`) | OpenBLAS `DYNAMIC_ARCH` with an Armv8 fallback and selected Neoverse kernels |
| macOS arm64 | Apple Silicon M1, selected by the macOS deployment target; no `-mcpu` | GMP `arm64 generic`; Apple Accelerate for FFLAS; FLINT's bundled OpenBLAS remains runtime-dispatched |
| Windows x64 | native Windows x64 baseline | generic vcpkg OpenBLAS; no unsupported claim of Unix GMP fat dispatch |

Every portable dependency uses explicit baseline flags. Givaro and
FFLAS-FFPACK pass `--without-archnative`. M4RI records fixed 32 KiB, 256 KiB,
and 8 MiB cache assumptions instead of probing the build host. igraph records
the same compiler baseline. Optional Linux x64 `ff_poly` and smalljac use only
x86-64-v1 instructions plus their documented x86-64 inline assembly.

`scripts/native-math-profile.cjs` is the policy authority. Its fingerprint
includes the target ABI, compiler identities, flags, dependency versions,
dispatch lists, and policy. FLINT, FFLAS, M4RI, and igraph store complete,
byte-bound dependency receipts, including the declared profile and observed
build evidence. On Apple Silicon, reuse is rejected unless GMP reports exactly
`arm64 generic`—a mere absence of `-mcpu=native` is not sufficient evidence.

Run the release gate after building all native dependencies:

```sh
node scripts/release-cpu-profile.cjs
node scripts/release-cpu-profile.cjs --json
```

`SAGEJS_NATIVE_MATH_PROFILE=cpu-native` remains available for local benchmarks.
It requires both the C and C++ compilers to accept the appropriate native flag,
omits x64 GMP fat dispatch, fingerprints the build CPU, and is categorically
ineligible for an official artifact. If either compiler rejects tuning, the
build falls back visibly to portable semantics but retains the non-release
request in its receipt.

This gate proves declared build policy and selected configure outcomes. It does
not replace clean-machine execution on older CPUs, binary instruction auditing,
or the separate OS/SDK/glibc compatibility gates.
