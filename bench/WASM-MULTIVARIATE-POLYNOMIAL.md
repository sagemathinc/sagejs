# Bounded multivariate polynomial WebAssembly slice

## Selection profile

The selected public workload is exact multivariate resultant over `ZZ`:

```python
R = PolynomialRing(ZZ, names=("x", "y", "z"))
x, y, z = R.gens()
left = (x+y+z+1)**7 + (x-y+2*z+3)**6 + y**5*z
right = (2*x-y+z+2)**6 + (x+2*y-z+1)**5 + z**6
value = left.resultant(right, x)
```

The reproducible benchmark constructs each immutable workload once, then takes
an odd-count median of 11 public calls. On the recorded Linux x64 host, the
representative public GCD took 0.810 ms, resultant took 39.231 ms, and the
bounded three-generator Gröbner basis took 0.184 ms. The resultant was 48.4x
the GCD time and 213.4x the Gröbner time. Its 120 and 84 input terms produced
946 exact output terms. This is the highest-impact profiled operation with a
direct mature FLINT core and a viable single-result packed transfer.

Run the profile and packed native-core benchmark with:

```sh
node bench/wasm-multivariate-polynomial.cjs
```

The packed boundary took 36.120 ms for the same workload, including decoding,
FLINT computation, and encoding. It copied 4,928 ingress bytes and 32,192
egress bytes in one mathematical crossing. The accepted initial budgets are
100 ms warm native and 250 ms warm browser, at most one mathematical crossing,
1 MiB ingress, and 16 MiB egress. These are regression ceilings, not targets
to inflate automatically.

## Mathematical and packed contract

`sagejs_fmpz_mpoly_resultant_packed` is a host-neutral C boundary around
FLINT's `fmpz_mpoly_resultant`. It supports exactly:

- coefficient ring `ZZ`;
- two or three variables;
- lexicographic, degree-lexicographic, or degree-reverse-lexicographic order;
- at most 256 nonzero distinct terms per input;
- at most 16 little-endian 32-bit magnitude words per input coefficient;
- eliminated-variable degree at most 8;
- total degree in the remaining variables at most 8 per input term;
- at most 1 MiB of copied input and 16 MiB of canonical copied output.

The degree bounds imply resultant total degree at most 128 in the remaining
variables for the supported three-variable case. Together with the input term
and coefficient bounds, this keeps the normal slice finite before FLINT is
entered; the post-computation byte bound remains a second fail-closed guard.

The input starts with eight little-endian `u32` fields: `SMPI`, version,
operation, variable count, order, eliminated-variable index, left term count,
and right term count. Each term has a sign, nonzero magnitude-word count,
least-significant-first magnitude words, and one `u32` exponent per variable.
The output starts with six fields: `SMPO`, version, operation, variable count,
order, and term count, then canonical FLINT-ordered terms in the same integer
representation. Zero polynomials use zero terms. Encoded zero coefficients,
duplicate monomials, truncated fields, trailing bytes, and noncanonical leading
zero words are malformed.

The caller owns both byte buffers. The synchronous core retains no pointer or
foreign object. A normal production call reserves the 16 MiB bounded output
once, so the complete result is one crossing. `OUTPUT_TOO_SMALL` reports the
required length without recomputing inside the core; an integration adapter
must not retry the expensive normal workflow and should reserve the reviewed
capacity initially. FLINT allocation is internal to the call and all three
polynomials and their context are deterministically cleared on every returned
status.

## Fallback and error domain

Status is fail-closed and separates structure, capability, mathematics, and
transport:

| Status | Meaning | Public disposition |
| --- | --- | --- |
| `OK` | Exact canonical resultant is present | Materialize the public polynomial |
| `MALFORMED` | Packet is structurally invalid or noncanonical | Internal adapter error; never retry as mathematics |
| `UNSUPPORTED` | A valid public input exceeds the reviewed ring/size/degree domain | Use the existing exact native FLINT route on Node; otherwise report capability unavailable |
| `FLINT_FAILURE` | FLINT declined the exact computation or an impossible encoding invariant failed | Raise the existing `RangeError("FLINT could not compute the resultant")` |
| `OUTPUT_TOO_SMALL` | Caller buffer cannot hold the computed result | Adapter defect for the normal route; no silent portable recomputation |
| `RESULT_LIMIT` | Canonical result exceeds 16 MiB or fixed-width output fields | Raise a reviewed Sage.js resource-limit error |

`SAGEJS_NATIVE_DISABLE=1` does not disable the installed FLINT addon; it
disables source-compiled kernels. The focused test nevertheless runs identical
public source in ordinary and native-disabled modes and proves the existing
exact Node oracle. Browser execution outside the bounded `ZZ` domain is an
explicit capability error until another exact bounded slice is reviewed. It
must not silently run a comparable JavaScript resultant.

## Fixed tracing and public integration handoff

Shared public dispatch, build topology, route registries, and workload corpus
are intentionally integration-owned. Integration must make these exact edits:

1. Compile `packages/flint/src/multivariate_wasm_core.c` into the lazy FLINT
   exact-algebra Wasm artifact and export only
   `sagejs_fmpz_mpoly_resultant_packed` through a bounded input/output adapter.
2. Give browser-side `ZZ` multivariate polynomials a canonical sparse host
   representation sufficient for public construction, cheap orchestration,
   and materialization. Normal resultant computation must cross once through
   the packed core; the host must not implement the resultant algorithm.
3. In `MultivariatePolynomialElement.resultant`, select the packed route only
   after checking this documented domain. Preserve the existing public result,
   parent, ordering, variable validation, and exact Node FLINT fallback.
4. Record the private, fixed capability identifier
   `wasm-library:flint:fmpz-mpoly-resultant-packed-v1`. The adapter—not user
   code—records target `wasm32-wasip1`, one call, packet ingress bytes, packet
   egress bytes, one boundary crossing, and their sum as copied bytes. Expose
   no public trace-record constructor and reject counterfeit route assertions.
5. Add the public source above to Node-Wasm and real-browser proof runs. Require
   exact equality with native Node, the fixed capability identifier, one
   crossing, 4,928 ingress bytes, 32,192 egress bytes for the benchmark vector,
   and no `portable-computation` route. Force the capability off and require
   the documented exact Node fallback or browser capability error.
6. Classify the new C file as an external-library adapter in
   `architecture/native-code.json` and add the exported core to the shared
   native/Wasm boundary inventories. This lane deliberately does not edit
   those shared registries.

The direct test compiles the same file with strict native warnings, exercises
large coefficients and malformed/limit cases, and, when the locked Sage.js Wasm
FLINT toolchain is present, links and executes that same test body as real
`wasm32-wasip1`. No shell, process, filesystem, socket, or general Node API is
part of the mathematical boundary.
