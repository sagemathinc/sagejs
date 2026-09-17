# Successful unequal-bound honesty audit

This correctness-only lane closes the successful state transition that the
earlier all-failure honesty fixture could not exercise. Its authority is the
pinned PARI 2.17.4 `src/basemath/buch2.c` `be_honest` implementation:

- archive SHA-256
  `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`;
- `buch2.c` SHA-256
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.

PARI copyright and GPL-2.0-or-later terms apply to the translated scheduler.

## Deterministic selection before implementation

No previously frozen identity exercised a nontrivial successful honesty
schedule. `check_honesty_success.cjs` therefore scans only the 16 already
predeclared tuning identities, in their frozen Phase-1 development order, with
`C1=5`, `C2=31`, and `setrand(1)`. It accepts the first identity for which:

1. pristine PARI returns success;
2. the unequal bounds create a nonempty outer interval;
3. at least one actual Fincke--Pohst probe runs; and
4. at least one temporary `KCZ` increment occurs.

The first match is panel row 21, LMFDB identity `5.3.1009349859375.3`, with

```text
36 + 930*x - 305*x^2 - 90*x^3 + x^5.
```

The fixture records every preceding selection result. It neither changes the
performance panel nor opens the reserve.

## Exact source trace

Pristine source reports `KC=6`, `KCZ=3`, and `KCZ2=10`. The seven outer rows
are retained as `(iz, p, raw J, last e, effective J)`. Four rational primes are
skipped because removing the final unramified prime leaves no check. Six prime
ideal representatives remain:

```text
(4,11,1), (4,11,2), (4,11,3),
(5,13,1),
(9,29,1), (9,29,2).
```

All six no-cache Fincke--Pohst probes succeed on their first attempt. PARI
therefore increments the transient `KCZ` after the complete groups over 11,
13, and 29, observing `4,5,6`, then restores the original value `3` after the
outer loop. No random word is drawn and the complete resident RNG integer is
identical before and after the call.

The selected identity has no nonidentity automorphisms. Because no probe
fails, retry products do not run, so neither `Q_primpart` nor the high-bit
`idealred` branch runs. Those branches are explicitly inactive, not silently
claimed or approximated.

## Implemented scheduler

`honesty_success.py` is ordinary CPython-parseable source with two `@native`
functions. It authenticates the exact outer and probe schedules, publishes the
six exact prime-ideal HNFs, applies each temporary increment only after all
representatives over that rational prime succeed, and restores `KCZ` only
after all six probes. A failed or malformed observation rejects before
publishing scheduler state, ideal state, or RNG state.

The checker rebuilds the instrumentation from the pristine archive on every
run, repeats deterministic selection, compares the complete fixture, then
replays the scheduler through CPython, JavaScript, GMP, and tagged native
backends. Dynamic and native transcripts, ideals, terminal state, and RNG
preservation agree exactly.

## Boundary and remaining generic work

This is a complete scheduler for one successful frozen unequal-bound case,
not a generic `be_honest` implementation. The existing shared driver remains
unchanged. Generic work still needs separately authenticated cases for:

- a failed probe followed by a successful retry within a complete schedule;
- nontrivial `pr_orbit_fill` automorphism orbits;
- retry arithmetic that takes outer `Q_primpart`;
- retry ideals whose leading entry crosses the `idealred` threshold; and
- general field preparation connecting arbitrary panel identities to the
  resident no-cache collector. The current collector fixture exporter prepares
  only its four historical fields, so this quintic's six success decisions are
  pristine-PARI observations rather than Sage.js collector outputs.

No equal-bound skip, inferred class-group result, or performance claim is used.
