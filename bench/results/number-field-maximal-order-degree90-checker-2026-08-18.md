# Degree-90 compact BL checker receipt

Measured source: `3f2e26fb0725148f569966b199cd490525a159f3`,
integrated as `049732200e72be31e722f02a9a0825b574a64b8b`. The
production BL artifact was cache key `481f5b190a98de42c8d61be86de65f3a93b7d19df45a312e22e5d0bea27d4ae5`
with source hash `476c6597d65c1d61ebdfee444d80f9be70473096b96ec5f92d57d2b081732e66`.
The exact redirected benchmark output has SHA-256
`6909ee029419d9d5ddfe6632305affccefc502e86d42c4901705f9ab8c360dfd`.

The uncached degree-90 arithmetic child completed in **1.968191232 seconds**,
well below both the 3.5-second lane target and the 5-second orchestration
gate. Construction took 1.044193536 seconds. Independent proof took
0.923997696 seconds: 0.910679808 seconds in the compact closure boundary and
0.013317888 seconds in the remaining certificate checks.

The proof computes one scaled inverse, checks the first five generator shifts
forced by the monic obstruction identity, and checks one generator square.
The exact index then identifies the candidate lattice. This replaces the old
degree-cubed multiplication-table replay while retaining the full readable
dynamic fallback and corruption rejection.

Cold runtime work is reported separately: module import took 2.850772224
seconds and native artifact autoload took 0.013732352 seconds. Total script
time was 4.948539648 seconds and fresh-process wall time was 5.470165574
seconds. There were zero same-input warmups; the first arithmetic child was
the measured child. Both fused construction and batch proof reported
`native-capable`.

The immutable BL projection binds the accepted live result's polynomial,
local support, source decomposition component, basis, index, discriminants,
and evidence. Nested source mutation invalidates its seal, enabling exact
no-replay portfolio binding after the one successful checker call.

Focused CPython dynamic projection/corruption checks pass, strict baselib has
zero errors, and the parallel task contract passes. The broad native suite
remains the integration lane's final validation responsibility.
