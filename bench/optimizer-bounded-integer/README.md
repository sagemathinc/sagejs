# Bounded exact-integer optimizer evidence

This benchmark separates the new fused scalar representation from the cubic
class-group negative control. Run it after `pnpm build`:

```sh
node bench/optimizer-bounded-integer/run.cjs
node bench/optimizer-bounded-integer/run.cjs --check
```

The scalar measurement includes entry authentication, every intermediate
range check, interrupt-poll branches, final materialization, and the function
boundary. It reports cold and warm target calls, pass-planning time, Sage.js
O0, CPython, and an exact BigInt loop. There are zero copied bytes and zero
foreign boundaries; one modified scalar is materialized at successful exit.

`held-out-cubic-negative-control.json` records the independently owned
`origin/class-group` wishlist and profiler evidence at `1632893e`. The current
generated JavaScript cubic candidate kernel took about 1.50 ms call-only versus
57 microseconds native (about 26x slower), and about 1.64 ms versus 181
microseconds including fresh buffers. Those kernels use mutable
`IntegerBuffer` storage, nested enumeration, remainder, floor division, and
publication effects outside this scalar proof. The bounded-integer pass must
therefore explain and reject them; it must not rename that diagnostic route as
an optimization.

The scalar target is promoted on the narrower, broadly useful public contract:
exact `int`-annotated scalar loops that stay in the inclusive JavaScript Number
range. Overflow or a non-Number exact integer discards the private locals and
runs the original Number/BigInt loop. The benchmark's `--check` mode requires
the checked target to beat both the exact BigInt loop and the measured Sage.js
O0 loop while returning the same exact answer.
