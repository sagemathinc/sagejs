# Live h=1 honesty terminal root

`compose_h1_honesty_terminal` joins two decisions from one live resident attempt:

1. the completed class attempt has class number one and zero active Smith
   invariants; and
2. the generated factor-base counters satisfy PARI 2.17.4's exact post-`compute_R`
   dispatch predicate, `KCZ2 > KCZ`, in the skip direction.

The composer accepts the resident owners themselves: `prep_base_state`,
`prep_state`, `attempt_state`, `class_number`, `class_invariants`, and
`relation_state`. It accepts no fixture, honesty status, skip bit, or PARI
answer. The nested honesty component checks the preparation phase and copied
factor-base counters before deriving its result.

The checker takes a freshly generated resident output JSON as a command-line
input. For the authentic cubic it observes live `KCZ=KCZ2=48` and publishes the
root. A coordinated mutation to `KCZ2=49` is rejected because real honesty is
then required. Injecting an `honesty_status` property has no effect because the
composer never reads it. Focused ordinary-Python tests additionally reject
nonterminal class state, nontrivial class quotient, and incomplete relation
publication without mutating input owners.

This root is deliberately narrow. It does not claim unit reconstruction,
regulator certification, or unequal-bound honesty.
