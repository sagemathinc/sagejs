# Finite-extension msolve block export: bounded F3 investigation

Status: **full prime-characteristic block export demonstrated on a small
independent corpus; production acceleration deferred.** No runtime dispatch,
ABI, proof policy, release or Milestone N implementation changes accompany
this investigation. It follows Milestone F qualification at `077b64861`.

## Question and result

For `K = GF(p)[a]/(m(a))`, encode coefficient coordinates into
`GF(p)[x_1,...,x_n,a]`, add `m(a)`, and order the `x` block above `a`.
The experiment calls the vendored `export_f4` directly, with `mon_order=0`,
`elim_block_len=n`, `nr_vars=n+1`, one thread, exact sparse linear algebra
(`la_option=2`), and reduced output. This is **not** the existing public
Sage.js adapter: that deliberately fixes elimination-block length to zero.

The prime-characteristic full-basis contract looks viable. In the vendored
`src/neogb/f4.c`, removal of eliminated polynomials is disabled with `#if 0`.
`export_results_from_f4` delegates to `io.c`'s `export_data`, which exports
all surviving basis rows and both exponent blocks. These source observations
were checked by an isolated executable linked to the actual candidate's
`gb.o`, not merely inferred from an upstream description.

The smallest witness is `GF(3)[x,a]`, block order `x > a`, with input
`[x*a - 1, a^2 + 1]`. The exported basis is
`[a^2 + 1, x + a]`, not only the elimination ideal `[a^2 + 1]`.
Decoding into `GF(9)[x]` gives `[x + a]`, as required.

The broader check runs the **36 degrevlex cases** of
`test/fixtures/extension-fields-sage-oracles-v1.json`: six explicit field
presentations and zero/unit, positive-dimensional, order-sensitive,
homogeneous and nonradical ideals. It expands coefficient coordinates,
appends the defining relation, then decodes output by grouping equal `x`
exponents, reducing powers of `a`, dropping zero polynomials, making each
polynomial monic and removing exact duplicates. It does **not** compute a
new Gröbner basis to repair the candidate. All 36 decoded bases equal the
independently generated SageMath answers exactly.

Coefficient reduction/inversion in this check uses the separate CPython
`ReferenceField` arithmetic from the fixture checker, not FLINT or Sage.js
field objects. All 108 original reference-engine/oracle checks execute first.
This establishes these finite examples, not all block shapes, all orders, or
production safety. In particular, no lex/deglex fast path is claimed.

## Why no fast path ships yet

`export_f4` returns lengths, exponents and coefficients but no transformation
matrix expressing its output in the input ideal. S-pair checks and reduction
of the original generators establish only part of the contract: the unit
ideal would pass those tests for every input. We still need independently
checkable output-in-input-ideal provenance. Recomputing the complete reference
basis could supply a check but is not evidence of an acceleration.

A follow-up needs a reviewed bounded block ABI with full input/output shape
validation and the existing mutable-state/host-error isolation, transformation
provenance or another complete exact certificate, adversarial tests, and native
four-platform plus production Wasm qualification. Only then should a controlled
benchmark compare total encoding, F4, decoding and certification costs with the
direct exact path. No automatic dispatch envelope is justified here.

The isolated runs retain CPU and subprocess wall times as diagnostics only.
They are tiny correctness cases on a shared Linux x64 VM, not representative
performance benchmarks. There is no claimed speedup, Windows/Wasm probe pass,
peak-memory envelope or numerical comparison across architectures.

This bounded tranche stops here. It resolves full prime-characteristic export
but defers proof/adapter/performance work. The exact generic implementation
remains the production path under both global and explicit proof settings.
Characteristic-zero export/lifting is a separate N4 question; this result must
not be extrapolated to number fields.

## Retained reproduction evidence

Research files are retained outside the product tree at
`/home/user/sagejs-extension-qualification-20260912/`:

| File | SHA-256 |
| --- | --- |
| `msolve-block-probe.c` | `2f548e60dd0a2d10c1c5627dbcc1a1e5b0f72af8b27a530d39eb71cb5e310061` |
| `msolve-block-probe.py` | `6c326dc9008f076ba7e9f86b7f5601c97d1a22b929216df0a8371acf416ed479` |
| `msolve-block-probe.log` | `19c502b93703fc297461e59017ae00c588ec7ae0fcff22f90e957f5f10ba4383` |

The linked `packages/flint/build/Release/obj.target/sagejs_flint/vendor/msolve/src/neogb/gb.o`
has SHA-256 `741d673f079929eb9464189c1620d8a2237ba5f0b16ad5f7b23912ea91ee34ec`.
It is the native object built for candidate `077b64861`; no vendored source
was changed. The small C program is a standalone ABI test adapter, not a new
mathematical implementation. It runs one call per subprocess with a ten-second
external timeout and frees exported arrays on success. It is not hardened for
arbitrary untrusted inputs and must not be installed in the library.

Build from that candidate checkout, using its validated GMP prefix:

```sh
cc -O2 -I packages/flint/vendor/msolve/src/neogb \
  -I /home/user/sagejs/packages/flint/.native/prefix/include \
  /home/user/sagejs-extension-qualification-20260912/msolve-block-probe.c \
  packages/flint/build/Release/obj.target/sagejs_flint/vendor/msolve/src/neogb/gb.o \
  /home/user/sagejs/packages/flint/.native/prefix/lib/libgmp.a -lm \
  -o /home/user/sagejs-extension-qualification-20260912/msolve-block-probe
python3 /home/user/sagejs-extension-qualification-20260912/msolve-block-probe.py \
  /home/user/sagejs-worktrees/extension-fields-payload
```

The independent fixture's Sage provenance is recorded in
[`extension-fields-sage-oracles.md`](../test/fixtures/extension-fields-sage-oracles.md).
The inspected vendored implementation credits Jérémy Berthomieu, Christian
Eder and Mohab Safey El Din under GPL-2.0-or-later. This report describes it;
no upstream mathematical implementation has been copied into new runtime code.
