# Stage-A checked region on the real splitting-degree catalog

This experiment bridges the compiler's fail-closed checked-region machinery to
the exact catalog workload that produced the 1.6307 ms generated-C result. It
does **not** remove a single arithmetic or bounds check. Its purpose is to prove
that the compiler can represent, emit, build, dispatch, and execute the real
private graph before optimized capabilities are enabled.

The reproducible driver is `check_stage_a_catalog_region.cjs`. It consumes the
frozen fixtures, the ordinary baseline build directory, and a compiler
worktree. It installs the declaration in portable lowered IR, emits fresh host
artifacts, builds a disposable addon, replays every complete expected snapshot,
and runs a paired timing diagnostic.

## Exact private graph

The graph is the complete 36-function lowered module. There are 58 internal
call edges and no edge leaving the set:

1. `int64_pari_prime_degree_catalog`
2. `int64_pari_flx_small_factor_workspace_size`
3. `int64_pari_get_fs_small`
4. `int64_pari_f2x_small_degfact`
5. `uint64_f2x_div_exact`
6. `uint64_f2x_rem`
7. `uint64_f2x_degree_nonzero`
8. `int64_pari_flx_small_degfact`
9. `int64_pari_flx_small_ddf`
10. `int64_pari_flx_small_krouu_odd`
11. `int64_pari_flx_small_sort_factor`
12. `int64_pari_flx_small_squarefree`
13. `_int64_pari_flx_small_ddf`
14. `int64_pari_flx_small_quotient`
15. `int64_pari_flx_small_optpow`
16. `int64_pari_flx_normalize`
17. `int64_pari_flx_copy`
18. `uint64_pari_word_mod_inverse`
19. `int64_pari_flx_deflate`
20. `int64_pari_flx_deriv`
21. `int64_pari_flx_gcd`
22. `int64_pari_flx_divrem`
23. `_int64_pari_flx_divrem`
24. `int64_pari_flx_flxqv_eval`
25. `int64_pari_flxq_mul`
26. `int64_pari_flx_mul`
27. `int64_pari_flx_rem`
28. `int64_pari_flx_sub`
29. `int64_pari_flxq_powers`
30. `int64_pari_flxq_sqr`
31. `int64_pari_flx_sqr`
32. `int64_pari_flxq_powu`
33. `int64_positive_bit_length`
34. `int64_power_of_two`
35. `int64_shift_right`
36. `int64_pari_flx_div`

The driver asserts this ordered list against the baseline IR, checks closure,
and records every edge in its JSON output. It found exactly 36 private variants,
and the emitted entry dispatch calls the private catalog function. All four
frozen packets satisfy the Stage-A guard, so all four execute the private graph.

## Recovered diagnostic guard

The surviving generated C establishes the exact contract used by the 1.6307 ms
diagnostic:

```text
len(state) >= 4
2 <= degree <= 4
prime_count >= 0
capacity = prime_count * degree, with checked int64 multiplication
len(coefficients) >= degree + 1
len(primes) >= prime_count
len(exact_workspace) >= 29
len(word_workspace) >= 393
len(word_metadata) >= 393
len(factor_degrees) >= degree
len(factor_exponents) >= degree
len(group_degrees) >= degree
len(group_counts) >= degree
len(local_state) >= 3
len(pattern_offsets) >= prime_count
len(pattern_counts) >= prime_count
len(full_offsets) >= prime_count
len(full_counts) >= prime_count
len(pattern_degrees) >= capacity
len(pattern_multiplicities) >= capacity
len(full_degrees) >= capacity
```

The present Stage-A schema can express scalar intervals and constant buffer
minima only. The installed declaration is therefore the expressible projection
of this guard: degree and prime-count intervals, the capacity-safe universal
upper bound on prime count, and constant minima for coefficients, state, fixed
workspaces, degree buffers, and local state.

This projection is sufficient **only because Stage A removes zero checks**.
The private clone still performs every original scalar, multiplication, length,
element-bounds, and error check. It would not justify either
`int64-arithmetic` or `direct-buffer-access` capabilities.

Before optimized capabilities can use this declaration, the verifier needs
three additional typed, fail-closed relationships:

- checked scalar product binding (`capacity = prime_count * degree`);
- buffer length at least a scalar plus a constant
  (`coefficients >= degree + 1`); and
- buffer length at least a scalar or checked product (the per-prime and output
  families above).

## Correctness and size

Using compiler commit `c980c325b`, the driver replayed all four frozen packets
exactly. Results and every
post-call buffer value agreed with the CPython-derived fixtures, including all
7,081 active outputs in packet zero. The fixture SHA256 was
`f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312`.

The emitted private definitions still contain checked signed arithmetic and
element-bounds failures; the driver asserts both before building.

| artifact | ordinary baseline | Stage A checked region |
| --- | ---: | ---: |
| generated core C | 5,774,897 bytes | 7,344,614 bytes |
| stripped addon | 174,264 bytes | 215,224 bytes |
| ELF `.text` | 166,203 bytes | 206,867 bytes |

The size increase is the expected cost of retaining the complete public graph
and adding a second, fully checked private graph.

## Timing

Three independent seven-pair alternating packet-zero runs, pooled geometrically,
with compilation, packing, assertions, and decoding excluded, measured:

| implementation | geometric mean (ms/catalog) |
| --- | ---: |
| ordinary safe tagged baseline | 3.3119 |
| Stage A private checked graph | 3.4669 |

Stage A was 1.0468 times baseline, about 4.7% slower. This is diagnostic rather
than a regression target: it deliberately duplicates the graph without
authorizing any optimization. The important result is that the production
representation now reaches the real catalog boundary and preserves exact
behavior. The next measurement should enable independently verified region
capabilities only after the full relational guard is representable.
