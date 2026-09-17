# H1 private IntegerBuffer qualification

One bounded Linux qualification was run from integration commit `fd6ea9d76`
with the complete authenticated `pari-h1-matched-flag-zero-state-v1` layout.
The build and profile each ran in a separate process group with a sampled
aggregate 4 GiB RSS hard limit and 600 second wall limit.  No virtual-address
limit was applied, neither process was killed, and no retry or paired timing
series was run.

The one-job build took 350.278 seconds wall time and peaked at 2,396,592 KiB
aggregate RSS.  Its 13,724,520-byte addon has SHA-256
`b7c046b1bde1f82cd2b562b94340fc0559885c16ffee826f4c1d8bd99e7b4ca3`.
The profile child peaked at 2,378,796 KiB.  Its 98.065-second wall duration
includes an exhaustive post-timing scan of all unused limbs in all 348 packed
integer buffers; the scan deliberately lies outside both reported native
kernel intervals.

The native call took 1,399,545,000 ns externally and 1,399,348,051 ns by the
mutually exclusive internal partition.  Internal closure is exactly 100%; the
internal-to-external closure is 99.9859%.  Preparation takes 165,052,648 ns,
an 89.2300% reduction from the qualified one-buffer sample's 1,532,522,604 ns.
Inclusive time falls 41.2429%, from 2,381,579,814 ns.  This is a single
diagnostic sample, not a qualified timing distribution.

The new dominant stage is compact/getfu at 1,106,009,866 ns (79.04% of the
root).  Preparation is 165,052,648 ns, log/HNF 86,447,423 ns, and relation
collection 36,486,590 ns.  The remaining four stages together are below
5.4 ms.

All 348 `IntegerBuffer`s were canonical after root publication: every limb at
or above the signed logical size of every slot was zero.  The 20 public
read-only owners therefore remain canonical, and the 328 private owners were
canonicalized before publication.  All five previously instrumented buffers
record zero capacity-cleared words; `prep_kummer_catalog_tau` retains exactly
1,188 writes and 582 logical words.  The call exposes the scale mismatch that
made eager clearing expensive: 10,857 logical limb words versus
4,550,975,488 capacity limb words across 1,111,078 slots.

The frozen relation, compact, combined-owner, terminal-RNG, relation counters,
root state, and one-attempt p192 getfu state all agree exactly.  The result
continues to report `public_complete=false`; this optimization does not invoke
or relabel the stronger exact-unit suffix.

Exact machine-readable values and scratch receipt hashes are frozen in
`h1_private_integer_buffer_qualification.json`.
