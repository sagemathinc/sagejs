# Final immutable mutation replay

`check_class_group_final_mutations.cjs` is the focused Phase-5 negative gate
required by `agents/pari-class-group-end-to-end-native-plan.md`. It constructs
one valid `connected-final-state-v3` result through the ordinary Python
assembler, pins its publication SHA-256 out of band, and then mutates every
material component named by the plan.

The mutations cover:

- a relation cell;
- a Smith transformation cell;
- an ideal principal-generator coordinate;
- a unit-factor exponent;
- a packed logarithm cell;
- independently derived regulator evidence;
- the torsion order;
- a class-group invariant factor;
- a live-owner logical length;
- the PARI-correspondence assumption record; and
- the terminal status.

Ten cases remain rejected after an attacker recomputes the embedded payload
hash, every component fingerprint, the outer payload hash, and supplies the
resulting outer digest as authority. Those cases are therefore rejected by
independent structural or mathematical replay, rather than merely by a stale
checksum.

The ideal principal-generator coordinate has a deliberately different
classification. The current v3 result says that exact ideal arithmetic replay
is unverified, so the cold verifier cannot honestly prove that coordinate.
It is nevertheless immutable retained material: a coordinated mutation fails
against the separately retained publication digest. Calling this an exact
ideal proof would weaken the result's honesty contract, so the receipt reports
it as `publisher-pinned-retained-state` and leaves `phase5Complete` and
`publicComplete` false.

Finally, the checker mutates every original live input owner after publication
and confirms that the published canonical bytes and detached replay are
unchanged. This establishes the ownership boundary in addition to mutation
rejection.

Run the gate with:

```bash
node bench/pari-class-group-port/check_class_group_final_mutations.cjs
```

The small JSON fixture contains inputs to the real assembler, not a detached
answer accepted without replay.
