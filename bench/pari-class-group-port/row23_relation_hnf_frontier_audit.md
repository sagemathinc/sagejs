# Panel row 23: relation/HNF frontier

This cut connects the authenticated row-23 prepared factor-base owner to the
resident relation representation. It consumes the live 31-ideal order and its
20 rational-prime groups. It does not read a frozen column map, relation row,
relation candidate, or HNF answer.

The native `init_rel` translation produces the exact fresh state

```text
frontier = [1, 0, 40, 40, 4, 31, 450, 31, 20, 9]
relation = [0, 450, 31, 9, 0, 40]
```

In particular, row 23 has **no rational-prime relations in the selected
factor-base prefix**: every selected rational-prime group is incomplete. This
is a useful difference from row 21, whose same live step contributed five
initial relations. All 40 row-23 columns therefore have to be obtained by the
small-norm and retry collectors before a first HNF can honestly run.

The current degree-five admission in `unreduced_small_norm.py` is deliberately
fixed to the already audited row-21 shape: 24 ideal packets, relation state
starting at five, target 32, three real embeddings, and its exact outer state.
Row 23 instead needs 31 packets, starts at zero, targets 40, and has five real
embeddings. Reusing the row-21 exception would fail closed. Widening that
corridor is the precise next implementation cut; changing only buffer sizes is
not sufficient because the admission embedding count and collector state are
part of the checked contract.

The checker executes the factor publication once and the relation publication
twice. Both relation owners agree exactly. Only after that does it consult the
frozen trace to assert that the independently selected target is 40. It also
rejects a mutated live factor permutation before executing native code.

Reproduce on Linux with a lane-private native cache:

```sh
SAGEJS_NATIVE_CACHE_DIR=/scratch/sagejs-native-cache-row23-relations-hnf \
SAGEJS_NATIVE_CACHE_ROOT=/scratch/sagejs-native-cache-row23-relations-hnf \
node bench/pari-class-group-port/check_row23_relation_hnf_frontier.cjs
```

This is an authenticated relation-frontier result, not a relation collection,
HNF, class group, unit computation, or qualified timing result.
