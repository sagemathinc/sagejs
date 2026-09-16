# Stage-F GCC inlining diagnosis

Date: 2026-09-16

This report explains why the first interval-proved local copy variant regressed
despite removing five logical-index checks.  It also evaluates whether source
attributes can repair the generated layout and records the required generic
emission shape.

## Exact artifacts

- Compiler: `670dda553`.
- Stage E: `/tmp/sagejs-stage-a-catalog-ag3Jht`, generated-core SHA-256
  `04923fbaef0dd5f2b67aedbd3d016ef2c54e26d0ebaab65032224955f1804853`.
- Stage F: `/tmp/sagejs-stage-a-catalog-2sJXqU`, generated-core SHA-256
  `fb1d6667be87a3e741b8a43ef36f25944a8c8dc631143c131b81ee8a0e7c4c37`.
- Fixture SHA-256:
  `f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312`.

The build uses the unchanged generated GCC `-O3` flags.  A disposable rebuild
added only `-fdump-ipa-inline-details` and `-fopt-info-inline-all` to explain
the already measured object; its symbols and layout matched the Stage-F
artifact.

## The source shape and the object shape differ

The Stage-F source appears economical:

```c
if (-1 <= da && da <= 8)
    return copy__local_fast_0(status, result, w, a, da, out);
return copy_checked(status, result, w, a, da, out);
```

Early-inlining initially rejects both callees: GCC reports growth 62 for the
local variant and 109 for the checked original.  The later IPA pass reverses
that decision.  Its final dump records:

- local variant inlined into the wrapper;
- checked original inlined into the wrapper;
- branches from cloned wrappers subsequently inlined into several callers.

The resulting object contains all three:

| Symbol | Stage E | Stage F |
| --- | ---: | ---: |
| Checked-region copy wrapper | `0x294` (660 B) | `0x5e8` (1,512 B) |
| Local-fast copy clone | absent | `0x1a5` (421 B) |
| Ordinary checked original | `0x294` (660 B) | `0x294` (660 B) |

The `0x5e8` wrapper is not a guard plus one call.  Disassembly shows a complete
local body and a complete checked fallback body.  The standalone `0x1a5`
local clone remains because some caller clones retain calls to it.

There are 23 relevant late inline events: two bodies into the wrapper, then
nine branch bodies into `flx_gcd`, four into `flx_small_degfact`, two each into
`flx_normalize` and `_flx_divrem`, and one each into `flxq_sqr`, `flxq_mul`,
`flx_mul`, and `flx_small_ddf`.

The exact private-symbol growth accounts for nearly all object growth:

| Symbol | Byte growth, E to F |
| --- | ---: |
| `flx_gcd` | +2,514 |
| copy wrapper | +852 |
| `_flx_divrem` | +716 |
| `flx_normalize` | +460 |
| local-fast copy clone | +421 |
| `flx_small_degfact` | +338 |
| `flx_small_ddf` | +44 |
| Total | **+5,345** |

Total object text grows by 5,534 bytes.  Thus the regression is concrete code
duplication rather than an unexplained optimizer effect.

## Attribute experiments

All candidates were disposable generated-C transforms.  Every benchmark first
validated the four frozen packets through JavaScript, GMP, and tagged backends,
plus the malformed-input panel.  Timing used three warmups and seven
alternating pairs with batches of at least 900 ms.

| Shape | Candidate / Stage E | Result | ELF text vs E |
| --- | ---: | ---: | ---: |
| Unchanged Stage F | about 1.127 | 12.7% slower | +5,714 B |
| Checked fallback `noinline` | 1.13254 | 13.25% slower | +1,914 B |
| Local-fast `noinline` | 1.06928 | 6.93% slower | +824 B |
| Both callees `noinline` | **1.05792** | **5.79% slower** | -2,704 B |
| Both callees and wrapper `noinline` | 1.07967 | 7.97% slower | -3,312 B |

Making both callees non-inline produces the intended 21-byte dispatcher, but
the runtime still pays a guard, dispatcher call, private-variant call, status
return, and output spill.  Static relocations make the extra layer visible:
Stage E has 23 calls to its copy helper, while this candidate has 17 calls to
the dispatcher and 24 calls to the local helper.  Smaller code alone does not
recover the lost call/ABI cost.

One further exact experiment moved both nine-word span validations into the
wrapper, emitted an unchecked direct local body, and kept a cold non-inline
checked fallback.  This preserves behavior for every input, but GCC produced a
`0x38f` wrapper and it ran 14.12% slower.  Rechecking degree and two spans on
every one of 55,903 copy calls is not an acceptable substitute for propagation.

## Required generic emission shape

No portable attribute combination fixes this architecture.  The compiler
should not emit a function-level guarded dispatcher for a private optimized
variant.  Instead:

1. Emit the ordinary checked implementation unchanged for public calls and all
   unproved private edges.
2. Compute a fixed point of per-edge facts: fixed view spans, scalar intervals,
   arithmetic safety, and absence of every remaining failure path.
3. Emit one private infallible variant from the proved body.  It should consume
   already validated pointers/views, preserve the original loop and overlap
   direction, and return its ordinary scalar result directly rather than via
   status/output pointers.
4. Rewrite only call edges whose facts discharge the complete precondition to
   call that private variant directly.  Do not emit a runtime guard on those
   edges.  Unproved edges continue calling the checked original.

This rule is source- and proof-based, not PARI-name-specific.  It preserves the
full external semantics because the unchecked implementation is unreachable
without a proof.  It also prevents GCC from seeing a hot branch containing two
alternative whole functions, so there is no fallback body to clone.

For this copy helper, the private body should approach the measured 288-byte
(`0x120`) whole-elision ceiling.  The remaining requirements are precisely the
two nine-word span facts, `-1 <= da <= 8`, safe loop latches and `da + 1`, plus
the direct result summary `result == da`.  Those facts also make the status
return and output spill unnecessary.
