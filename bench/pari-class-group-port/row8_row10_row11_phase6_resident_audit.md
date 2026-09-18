# Rows 8, 10, and 11 phase-6 resident prepared kernels

These diagnostic adapters authenticate one frozen prepared-number-field input,
then compile and allocate every native handle and backing owner before repeated
`runFresh` calls. Each run resets the resident frame and executes the same
initial root, four-handle Gate-C relation/HNF graph, analytic inverse-`hR`, and
post-HNF acceptance schedule. Rows 10 and 11 also compute the Smith invariants.
Row 11 continues through the preallocated native C5/C6 unit graph and authentic
`getfu`, whose terminal state is exactly `[2,21,0,0,0,0,0,1]` (`LARGE`).

The reported kernel clock is the sum of native mathematical calls only.
Compilation, backing allocation, owner reset/loading, inspection, hashing,
replay, filesystem access, subprocesses, and publication are outside it. Fixed
owner capacities fail closed; row 11 uses four-limb acceptance scratch for its
authenticated 192-bit corridor and does not widen dynamically.

The Linux-focused checks run two fresh invocations through
`qualification_execution_core.cjs`, require stable output/replay/RNG/work
digests, and reject a mutated prepared polynomial. Under
`prlimit --as=4294967296 --cpu=600` they produced:

| Row | Output | Replay | RNG | Work | Peak RSS KiB |
|---:|---|---|---|---|---:|
| 8 | `0a3e998f7f65ef69778786d6d3c3561d27d92dd217448b852e239a0bc4905368` | `4f29a42a3c575fbf5787bbf4715fab73a0fc91a052425e04a98e9d8a67a97d99` | `92409c90c4cc32f6a1f56a9361e87e7f8133bbf27cf5f143f52ebeb2d3d17245` | `b94dc2c088ad679359d6df0bd966bbb92dc54f51f1b14f346fa14ed01ead2bed` | 1,276,168 |
| 10 | `afdc8cd85ff5b2d4fc46a5fb3d0a06f56b7a5a37a6a3ece67e33a49da518895f` | `91b8bb4e1032f4e6f3d47b1bd77ede5429e0380d3ccd694d91ac9d02d15b39b3` | `d538eddeb98b7850b48a8fb79fd374eb8fe734fb2b3aeeeba7b6b24dcb0d2adc` | `67bc917b75c7bb6c1f924ca4934843c292faa48f74feb2dc9d64e3910ca6a398` | 1,279,380 |
| 11 | `5b951e709006e8561f6d6f6e90103eb84d753f3f7e7ab6fd7127461340becd85` | `6165eac6021dd2b515fc050ed87080b37e3617e52bbc277d0388b952f90694e4` | `b6186a7c9217e1d1987561adb2284424312182e53f71c1cf4f01a92cd5c8a1e0` | `f5f5b21790582e690648be10b4fa04e9083f0cd44371f9e48f298429fafc6614` | 1,276,476 |

These are differential correctness checks, not a qualification timing campaign.

## Row-11 certification boundary

The resident row-11 result path computes the live class number `4`, Smith
invariants `[2,2]`, regulator, unit-kernel transform, private `getfu` factor,
and terminal `LARGE` policy. It does **not** put the correctness-only replay of
all 430 principal ideals, compact class-witness construction, raw-unit
provenance expansion, norm/sign certification, or result publication inside
the prepared kernel. Those remain detached certification work. Consequently,
the resident root establishes the common class/unit projection and exact C5/C6
arithmetic, while the existing detached checks remain responsible for the full
correspondence witnesses.

The focused commands are:

```sh
node bench/pari-class-group-port/check_row8_phase6_resident_prepared_adapter.cjs
node bench/pari-class-group-port/check_row10_phase6_resident_prepared_adapter.cjs
node bench/pari-class-group-port/check_row11_phase6_resident_prepared_adapter.cjs
```
