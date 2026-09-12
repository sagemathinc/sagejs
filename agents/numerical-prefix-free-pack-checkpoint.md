# Prefix-free numerical production-pack prerequisite

N2 packaging increment, 2026-09-12, based on main `6c42dd093`.

The standalone compiler already exempts a nonempty, entirely binary64 IR with
no foreign libraries from the exact dependency prefix. The production aggregate
nevertheless emitted the GMP checkpoint allocator unconditionally, introducing
`gmp.h` and its support code even for those numerical-only kernels.

`tools/native-kernel/production-pack.cjs` now applies that narrow exemption to
its aggregator. Mixed, empty, unknown and foreign-library descriptions retain
the existing allocator. This decision inspects the actual lowered kernel kinds
and declared libraries, not Python function names. Generated source bodies,
wrappers, scalar semantics, ABI, source provenance and same-source fallbacks
are unchanged. The existing builder fingerprint changes the pack cache identity.

## Validation

`test/numerics/performance/prefix-free-pack.cjs` exercises the actual compiler,
aggregator, native linker and relocated generated wrappers in fresh child
processes. The numerical-only case supplies a nonexistent exact prefix and
links only the ordinary platform math library. The mixed case deliberately
requires the existing exact prefix and checks a 201-bit result. Both pack two
source modules, omit standalone addons from the relocated tree, require native
dispatch, retain zero signs and run all 200 exact-rational/CPython sum-oracle
cases. Inputs, output sentinels, statuses and output bits are checked. Repeated
pack building must authenticate a cache hit and retain the same identity.

All three tests pass without skips on Linux x64 with Node 22.22.2 and 26.8.1.
The observed numerical-only pack is 18,656 bytes; the mixed witness is 281,392
bytes. These are fixture pack sizes, not a complete installed-product payload
or memory measurement. The compiler's existing unused prefix include-directory
entry remains; actual compilation with that directory absent proves it is not
needed. No claim is made that the include-path metadata was redesigned.

Python formatting, strict Python (393 modules, zero errors), and the aggregate
architecture check pass on this main base.
The inherited lane checker sees unrelated live task manifests; this independent
main-based change does not retire or rewrite those contracts. Existing built
frontend inputs are used for the focused compiler tests; these are not a fresh
eight-stage build or frozen four-platform product receipt.

Reproduce the focused build/test on a prepared native development checkout:

```sh
node --test test/numerics/performance/prefix-free-pack.cjs
```

If the exact prefix lives elsewhere, set `SAGEJS_FLINT_PREFIX` explicitly. The
numerical-only child overrides it with its own nonexistent directory. Tests
remove only their invocation-owned scratch after the child exits, including on
Windows where loaded DLLs cannot be removed in-process.

## Scope still open

The production publisher, root index, generated wrapper lookup and SEA loader
still assume one mathematics pack. They must gain reviewed, content-addressed
pack routing before numerical users can avoid loading the exact pack in an
installed product. This PR does not enable a default, add a production-kernel
descriptor, or alter npm/SEA/browser layouts. Native Windows/macOS/ARM aggregate
execution and clean package qualification remain to be collected for that
integrated change; prior standalone binary64 platform receipts are not relabeled.
Public statistics still misses its 10 ms target. No performance-program phase
is declared complete by this packaging prerequisite.
