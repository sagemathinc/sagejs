# Hyperelliptic central weights and optional GPU twist screening

## Implemented CPU engine

For a genus-`g` Jacobian with

```text
Lambda(s) = A^s Gamma(s)^g L(s),  A = sqrt(N)/(2*pi)^g,
```

Sage.js computes the central jet from

```text
W_(g,k)(x) = k!/(2*pi*i) integral Gamma(s)^g x^(-s)/(s-1)^(k+1) ds,
Lambda^(k)(1) = (1+w*(-1)^k) sum_n a_n W_(g,k)(n/A).
```

This is one vertical-contour Dirichlet-polynomial calculation.  It replaces
the older nested inverse-Mellin and outer-theta grids for central requests.
The old route remains available as `algorithm="inverse_mellin"` and is the
principal differential oracle.

The native implementation uses Arb/Acb for finite arithmetic, returns actual
derivatives (not Taylor coefficients), enforces exact functional-equation
parity, and performs triangular completed-to-raw gamma-series division.  Fine
and coarse coefficient/contour plans must agree.  Since the contour
discretization and coefficient tail are presently checked by refinement
rather than a proved enclosure, diagnostics state `rigorous=False` while
separately recording that the finite Arb arithmetic balls are rigorous.

At 160 bits and above the central engine moves the equivalent Mellin contour
from `Re(s)=2` to `Re(s)=3`, increasing its distance from the pole at `s=1`.
Oscillatory phases are periodically recomputed instead of allowing hundreds
of interval multiplications to widen their balls.  On the conductor-713
genus-2 example, jets through order four agree between the specialized and
independent double-Mellin routes at 200-bit working precision (the checked
regression requires an absolute difference below `2^-150`).  This slower
high-precision path does not change the common 53/100-bit grids.

The strict-Python reference exposes `central_kernel` and `central_weight`.
For genus 2 it uses

```text
K_2(x) = 2*K_0(2*sqrt(x)),
W_(2,0)(x) = 2*K_1(2*sqrt(x))/sqrt(x).
```

Other moments and genus 3 use the defining contour.  The production genus-3
sum avoids evaluating one Meijer-G value for every coefficient by summing the
Dirichlet polynomial before integrating.

On the development Linux x64 host, after exact coefficients were warm, a
32-bit genus-2 jet through order four took about 28 ms after warmup, versus
214--218 ms for the old path.  An order-zero central value took about 29 ms
versus 230 ms.  A prepared central value is then a cache lookup, commonly
below 0.2 ms.  Run `pnpm bench:hyperelliptic-lseries` for cold and warm stages
on the current machine; timings are evidence for that commit and machine, not
a universal promise.

## Prepared `LFunctionInit`

`L.init(prec=..., max_order=..., domain=...)` retains the exact coefficient
provider, a materialized central jet, and a bounded point cache.  Central
values, ranks, and leading derivatives reuse that jet.  Noncentral points
requested together use one existing inverse-Mellin grid.  The object owns no
native pointer, and `close()` deterministically clears its host cache.

Process-local reference-weight and curve-plan caches are bounded, FIFO-
evicted, and inspectable.  They contain immutable published values or copied
plan dictionaries; failed construction is never inserted.  No disk cache is
enabled by default, so ABI-dependent native bytes are not persisted.

## WebGPU boundary and decision

The optional dependency is `webgpu` 0.4.0, the MIT-licensed Dawn Node binding.
Its unpacked package is approximately 71 MB and supports Windows x64, Linux
x64/arm64, and macOS x64/arm64.  Installation is optional; missing packages,
drivers, or adapters fail closed and leave every CPU API available.

The implemented WGSL kernel accepts packed f32 arrays for coefficients,
quadratic characters, and central weights.  One invocation accumulates each
row/order in increasing coefficient order.  It uses no unordered atomics, and
returns:

- the approximate dot products;
- conservative sequential-f32 roundoff plus supplied weight errors;
- device, implementation, numeric-format, reduction, and shader-hash
  provenance;
- an explicit `candidate_screen_only=True` and `rigorous=False` contract.

Ordinary CI uses Dawn's null adapter with a bit-for-bit f32 contract emulator;
it checks packing, error policy, provenance, and fallback, not physical GPU
performance.  A physical adapter must additionally pass the complete CPU
candidate corpus, deterministic-repeat tests, device loss tests, and the 5x
end-to-end crossover threshold before `backend="auto"` may select it.

At this commit no physical **WebGPU** acceptance receipt is recorded.
Therefore `backend="auto"` selects CPU, and explicit `backend="gpu"` rejects
even an available but uncalibrated device.  This is intentional: a working
shader is not enough to justify discarding possible near-zero twists.

### CUDA feasibility receipt

The standalone
`bench/hyperelliptic/cuda-twist-feasibility.cu` isolates the same packed f32
dot-product shape on CUDA.  It is a feasibility benchmark, not a Sage.js
runtime dependency.  Its GPU time includes coefficient, character, and weight
uploads, the kernel, and result download.  Compile it with, for example:

```sh
nvcc -O3 -std=c++17 -arch=sm_120 \
  bench/hyperelliptic/cuda-twist-feasibility.cu -o /tmp/cuda-twist
/tmp/cuda-twist 8192 4096 2
```

On 2026-08-21, exact commit `c5f4f2df`, an NVIDIA RTX PRO 6000 Blackwell
Server Edition with driver 580.173.02 and CUDA 13.0 gave:

| rows | terms | orders | one-CPU-thread | GPU end-to-end | speedup |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 256 | 4096 | 2 | 2.18 ms | 6.35 ms | 0.34x |
| 1,024 | 4096 | 2 | 9.02 ms | 4.00 ms | 2.25x |
| 4,096 | 4096 | 2 | 59.96 ms | 14.50 ms | 4.13x |
| 8,192 | 4096 | 2 | 146.33 ms | 28.85 ms | 5.07x |
| 32,768 | 4096 | 2 | 610.15 ms | 110.33 ms | 5.53x |

Thus the arithmetic and transfer crossover clears the planned 5x gate at
roughly 8,000 rows for this shape.  This does **not** enable GPU selection:
the Google compute image exposed CUDA but no NVIDIA Vulkan adapter, so Dawn
saw only Mesa llvmpipe.  A CUDA runtime backend or a Vulkan/vWS-equipped VM
still needs the full candidate-safety, checkpoint, and multicore comparison
before production selection.

## Twist checkpoint contract

Quadratic-twist checkpoints use schema v2.  The request records values versus
candidate mode, CPU/GPU request, threshold, coefficient formula, and exact
twist conductor/sign formula.  Each row records selected backend, candidate
decision, reason, numerical provenance, and per-stage timings.  Checkpoint
order remains the canonical fundamental-discriminant order, independent of
GPU scheduling.

The conductor scaling remains unavoidable: for genus `g`, ordinary sum length
grows roughly as `sqrt(N)*abs(D)^g`.  A GPU changes the dot-product constant;
it does not change that asymptotic cost.  Large family requests must therefore
be tiled and planned by total terms before allocating device buffers.

## Physical acceptance procedure

For each Apple Silicon and discrete NVIDIA/AMD device:

1. record exact commit, OS, Node, Dawn, adapter, driver, and shader hash;
2. compare every f32 row and conservative error interval with the CPU central
   engine;
3. refine every near-threshold row with Arb and verify identical candidate
   sets;
4. measure cold adapter/pipeline setup, uploads, kernel, downloads, checkpoint
   writes, and CPU refinement separately;
5. locate the measured crossover against both single-thread and multicore CPU;
6. require at least 5x over optimized single-thread CPU and a material gain
   over multicore CPU before enabling that device class under `auto`.

If the f32 error intervals retain too many rows, the next numeric experiment is
paired-f32 (double-single).  The correctness policy is not weakened to make a
GPU benchmark pass.
