# Row-21 Phase-6 resident frontier

## Result

Row 21 does **not** yet have an honest whole prepared-field resident kernel, so
it is not admitted to qualification timing. The prior wrapper/transaction time
must not be compared with PARI.

There is, however, a new real resident prefix. Ordinary CPython-parseable
`row21_phase6_factor_base_root.py` composes the translated factor-degree,
maximal-order descriptor, initial-bound, prime-ideal HNF, subfactor, and initial
relation routines behind one generated native call. Its input is authenticated
prepared-NF data; all mutable storage is allocated and reset outside the clock.
No factor or relation owner is a runtime input.

Under `prlimit --as=4294967296 --cpu=600 timeout 600s`, two consecutive calls
took 1,526,193,773 ns and 1,520,942,205 ns on the development host. These are
diagnostic prefix times, not qualification or PARI comparisons. The isolated
core was 28,100,896 bytes. Both calls reproduced exactly:

- factor owner `7784eef663b7ca2fad9259f2efe642a14aac511331d0ca9de93fae050aebc533`;
- initial relation owner `55f1f55a6b02a5d703834af49a716280f7841f3b399af92cdaf258c4b9855233`;
- bounds `C1=C2=57`, 24 ideals in 15 rational-prime groups, the four-entry
  subfactor base, and all five initial relation records, metadata, generators,
  and hashes.

Receipt: `/scratch/row21-phase6-factor-relation-check.json` (ephemeral,
SHA-256
`5f5fabdbaf0d334c57016767f2db8ef45d5f94e2bbfb792a87b8148eaececbcc`).

## Exact remaining cut

The first absent edge is from this live prefix into
`pari_connected_relation_hnf`. The existing HNF host reconstructs descriptor,
ideal, packet, permutation, and subfactor arrays as host objects, allocates a
separate native owner, and publishes a compressed first-HNF owner. Acceptance
then authenticates/project-rebuilds that owner; units do the same; final
assembly and replay still spawn CPython. Consequently there is no inclusive
resident clock spanning relation collection, HNF, analytic acceptance, unit
reconstruction, and terminal construction.

The next implementation must pass the prefix buffers directly into a composed
`pari_connected_relation_hnf` call graph, then compose the already translated
analytic/acceptance and rank-three unit roots. Only a final compact semantic
projection may cross back to the host.

## Honesty scope

The newly connected unequal-bound honesty transaction is genuine but is a
separate correctness fixture with `C1=5,C2=31,KCZ=3,KCZ2=10`. The ordinary
matched row-21 computation has `C1=C2=57,KCZ=KCZ2=15` and therefore performs
the source honesty skip. Substituting the custom factor owner would change the
matched algorithm. Phase-6 therefore preserves the real honesty evidence but
does not put it in the default timed path.

The honesty checker also passed under the same 4 GiB/600 s limits with a
lane-private native cache. It recomputed six live success statuses, performed
the `KCZ` restoration and one-shot `KCZ2=0` transition, cold-replayed the
result, and rejected four mutations. Receipt
`/scratch/row21-honesty-4g-600s-check.json` has SHA-256
`1658f4a27030f135e95bd520a603672349ac2fb9177ca7ca463a954cdb55f141`.

`row21_phase6_resident_frontier.cjs` exposes this state mechanically and throws
`SAGEJS_PHASE6_NO_RESIDENT_KERNEL` rather than returning wrapper timing.

## Validation

```bash
prlimit --as=4294967296 --cpu=600 timeout 600s \
  node bench/pari-class-group-port/check_row21_phase6_factor_base_root.cjs \
  > /scratch/row21-phase6-factor-relation-check.json
```
