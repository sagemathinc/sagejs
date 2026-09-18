# Row 23 Phase 6 resident-kernel audit

`row23_phase6_resident_kernel_host.cjs` establishes a new, strictly narrower
boundary for panel row 23 (`5.5.1002836007889.1`).  Its retained inputs are the
authenticated prepared number field and the factor-base owner produced from
that field before entry.  Within one process it executes the live relation/HNF
root, analytic and post-HNF acceptance, both rank-four lattice reductions,
`cleanarchunit`/`getfu`, and exact unit reconstruction.  Native owners flow
directly between these stages.  No intermediate owner is serialized, no
CPython process is entered, and final detached replay is not repeated inside
the root.

The ordinary matched result state is computed from the live owners, not from a
fixture:

- the relation collector accepts 40 relations over 31 factor-base rows;
- the terminal HNF presentation is `W = [6]`, hence the cyclic class group has
  invariant factor 6 and class number 6;
- the accepted unit lattice has rank 4;
- exact reconstruction returns four integral-basis units with norms
  `[-1, 1, 1, 1]`; and
- the exact-unit vector digest is
  `2f8c5f4ce98e4ccdcfcdc9cd2fc8bbaac38949093eb4aa5484af2584be9850bc`.

`check_row23_phase6_resident_kernel.cjs` runs the real computation in a fresh
child under a 4 GiB address-space limit and 600-second CPU and wall limits.  It
rejects mutations to the prepared field, retained factor owner, unit result,
and a detached copy lacking the live owner graph.  The checked receipt is:

```text
/scratch/row23-phase6-resident-kernel-check.json
sha256 7d0ed6f063821e3be53b51e83db28931209a7c558a9eb36bf3cd31877f823b6b
```

On the shared development host the inclusive diagnostic time was 60.621 s:

| mutually exclusive stage | time |
| --- | ---: |
| relation/HNF | 19.850 s |
| analytic/post-HNF acceptance | 25.200 s |
| rank-four lattice and clean-log bridge | 6.057 s |
| exact unit reconstruction | 9.512 s |
| semantic projection | 0.002 s |

These are **not qualification timings**.  They include per-invocation buffer
allocation and compiler-cache lookup, ran on the busy shared development host,
and cross fourteen native entry/exit boundaries.  They are useful only as an
inclusive attribution baseline.

The result closes the former serialization/CPython-final-replay blocker.  It
does not yet provide the plan's one-call reusable-storage timing root.  The
remaining executable blockers are now exactly:

1. split allocation from execution and reset/reuse all exact and floating
   owners outside the clock;
2. resolve all compiled exports before entering the clock; and
3. compose the fourteen native calls into one private generated call graph (or
   measure that call ABI as negligible with an identical-storage control).

`row23_phase6_timing_blocker_probe.cjs` names those three blockers and continues
to forbid a qualified ratio until they are removed.  Generator-ideal expansion
and detached replay remain valid independent evidence outside the matched
headline clock, as permitted by Phase 6; this root does not falsely time them
against stock PARI.

Validation:

```bash
node bench/pari-class-group-port/check_row23_phase6_resident_kernel.cjs
node bench/pari-class-group-port/row20_21_23_phase6_timing_blocker_check.cjs \
  --admission-only
```
