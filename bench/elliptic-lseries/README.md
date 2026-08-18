# Elliptic `L`-series benchmark

The matched workload measures construction, first evaluation, repeated
evaluation, and five independent points. For the motivating large-conductor
curve it additionally records the user-provided moderate-height points, the
proved direct-series route at `10+i`, a 101-point line, a 16-by-16 rectangle,
and adaptive versus forced-53-bit 100-by-100 domain-coloring plots. The
independent and batch workloads use separate L-series objects, so neither path
can reuse values populated by the other.

```sh
# Sage/PARI, one process
/home/user/sagelite/sage bench/elliptic-lseries/benchmark.sage

# Sage.js, after the public API lands
build/sea/sagejs bench/elliptic-lseries/benchmark.sage

# Optional Magma comparison, one process
/home/user/bin/magma -b < bench/elliptic-lseries/benchmark.m
```

Run the Sage and Sage.js commands at the same exact repository revision on an
otherwise idle `bench-1`. Warm timings must exclude startup and native
compilation. Keep process startup, first evaluation, repeated cached calls, and
batch evaluation separate; combining them hides both initialization cost and
cache behavior.

`batch_checksum` is the ordered weighted sum
`sum((index + 1) * value)`. It exercises ordinary complex arithmetic and avoids
making the benchmark depend on the implementation of `abs(complex)`.

The production target from the implementation plan is no worse than twice the
same-host Sage/PARI time for the first `L(1+i)` on `[1,2,3,4,999]`, with a batch
materially faster than independent cold calls. These are engineering targets,
not cross-machine constants.

The plotting timers include numerical evaluation and result transfer but not
browser rendering. `complex_plot_diagnostics` records evaluated versus
conjugation-reconstructed pixels and the accepted precision tier, making a
fast but numerically unresolved image visible in the benchmark output.
