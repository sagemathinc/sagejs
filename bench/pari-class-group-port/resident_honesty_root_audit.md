# Conditional resident honesty root

This root binds the existing authenticated unequal-bound scheduler into the
same live factor-base dispatch used by the equal-bound H1 path. It evaluates
PARI 2.17.4's `KCZ2 > KCZ` predicate from preparation counters; an equal state
returns the zero-work source skip, while the predeclared unequal cubic enters
the actual retry scheduler.

The correctness-only unequal case is
`x^3 - 20018*x + 20034`, `C1=5`, `C2=31`, `KCZ=2`, `KCZ2=9`, with
`setrand(1)`. The root publishes each scheduler ideal and norm to a no-cache
collector callback. It accepts no probe transcript or final answer. The
existing `check_honesty_scheduler.cjs` independently binds this callback to
`pari_collect_unreduced_ideal` and proves all 51 actual probes fail identically
under CPython, JavaScript, GMP, and tagged execution.

The root then composes all 50 real retry products. The scheduler stages each
RNG draw and retry ideal and commits them atomically only after arithmetic and
the frozen primitive-part/reduction predicates succeed. The correctness test
replays the complete ideal/norm schedule and checks 51 probes, 50 draws, and a
changed terminal RNG.

Equal-bound H1 is tested separately and performs zero probes and zero draws; it
is not counted as unequal coverage. A success observation and nontrivial
automorphism count return explicit `unsupported-success-continuation` and
`unsupported-automorphism-orbit` frontiers without consuming RNG. A malformed
probe observation rejects before the first retry and preserves RNG exactly.

The completed frozen failure has driver meaning
`restart-required-honesty-failure`: it does not publish a class/unit result.
Generic successful checked primes, automorphism orbits, outer `Q_primpart`, and
high-bit `idealred` remain explicit frontiers.
