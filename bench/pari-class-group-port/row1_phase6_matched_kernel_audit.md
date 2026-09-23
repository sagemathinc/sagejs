# Row 1 Phase 6 matched resident boundary

Row 1 now has the same external prepared-kernel boundary as pristine PARI:
authenticated prepared `nfinit` data outside, complete flag-zero class/unit
semantics inside. `row1_phase6_matched_kernel_host.cjs` retains the compiled
`pari_resident_generated_class_attempt` function, allocates fresh bounded native
owners outside the clock, and clocks one native call. Result projection and the
full ordinary-Python correctness replay occur after the clock.

The common projection checks the exact field and polynomial, class number 3,
invariants `[3]`, unit rank two, regulator presence, torsion order two, and the
3-by-2 logarithm shape. It deliberately omits representation-specific unit
coordinates and PARI's internal `LARGE` storage choice.

The checker rejects a changed class projection, authenticates fresh input, and
by default executes the independent fresh correctness transaction. It never
publishes a ratio from its single development observation.

```sh
prlimit --as=4294967296 --cpu=600 -- \
  node bench/pari-class-group-port/row1_phase6_matched_kernel_check.cjs
```
