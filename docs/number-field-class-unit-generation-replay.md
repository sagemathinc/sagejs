# Detached generating-base coverage

`sagejs.number_fields.class_unit_generation_replay.replay_generating_base(text)`
checks one prerequisite of class/unit completeness. It reconstructs a fresh
number field and maximal order, validates the supplied prime ideals, and checks
that they include the nontrivial prime ideals required by the exact Minkowski
bound. It returns plain data, never a live context, map, authentication token,
or completed class/unit result.

The input is canonicalizable JSON with exactly these fields:

- `schema`: `sagejs.number-fields/class-unit-generation-v1`.
- `field_order` and `factor_base`: the exact field/order and portable prime
  representations used by detached component replay, without instance tokens.
- `claimed_minkowski_bound`: a nonnegative exact integer, checked against the
  independently recomputed bound, never used to shorten enumeration.
- `content_sha256`: SHA-256 of the other fields serialized with sorted keys,
  compact separators and ASCII escaping. This detects corruption, not truth.

These fields can be copied from a component envelope into this separate schema;
the bound must be supplied and the new digest computed. Relations, units,
producer proof status and search history are deliberately not input to this
checker. Consequently, successful coverage does not verify those components.

## Mathematical boundary

Minkowski gives an integral ideal of norm at most
`(4/pi)^r2 * n!/n^n * sqrt(abs(D))` in every ideal class. Factoring that ideal
shows that prime ideals with norm at most its exact floor generate the class
group. The existing exact factor-base service supplies this floor and the
complete splitting enumeration. An unramified inert singleton is omitted
because it is the principal ideal `p O_K`; ramified singletons are retained.
All other required ideals must occur exactly as ideals in the submitted base.
Extra valid primes are allowed, but duplicate ideals are rejected.

The verifier checks the defining polynomial, maximal-order basis and
discriminant by fresh exact construction. It rebinds only freshly created
instance identifiers for the existing prime decoder, then requires exact
canonical serialization roundtrip. No producer object or cache is consulted.

The report always has `generation_only=true` and `complete=false`.
`generation_verified=true` and `status="verified"` establish only this
unconditional generating-base premise. `status="missing-coverage"` lists the
missing exact portable primes; it does **not** prove that the submitted base
fails to generate by some other argument. Principal representative witnesses
and conditional analytic generator theorems are not supported by this slice.
The report includes recomputed bound evidence, field/order and input digest.
It is diagnostic data, not a transferable authority object: future composition
must rerun verification and bind the identical field/order and ordered base.

Exact relation/presentation validation, full-rank units, torsion, and the final
index argument remain separate obligations. In particular, unconditional
Minkowski generation cannot remove the GRH assumptions from a BF analytic-index
certificate. This checker does not change the corrected conditional-only BF
policy or the existing component replay's incomplete status.

## Resource and capability boundary

Verifier-owned limits are degree 2–10, monic defining coefficients of at most
32 bits, discriminant magnitude below `2^128`, canonical rational coordinates
of at most 512 bits, 128 input/required prime ideals and rational primes and
Minkowski bound at most 1000. Exact JSON parsing reuses the component adapter's
4 MiB, depth, node, scalar and container limits, **not** its degree-four policy.
The fresh factor-base plan additionally permits at most 500 estimated rational
primes, 5000 estimated prime ideals, and 16 MiB estimated record memory. These
are stricter adapter limits, not changes to native or existing service limits.

Malformed or mathematically false claims raise errors; oversized input raises
`ComponentReplayResourceError`, including a truthful bound claim above 1000;
an understated bound instead fails equality with the recomputed bound. A plan
exceeding its estimated memory budget
or an actual required list exceeding 128 produces `status="resource-limit"`
with `generation_verified=false` and explicit `resource_failures`. No partial
enumeration grants coverage. Existing exact arithmetic capability declines
propagate; degree-generic code does not promise every degree-ten input works.
The count check may construct one additional prime record before declining.

These arithmetic/serialization limits are not a certified wall-time or RSS
bound. Maximal-order construction and splitting may be expensive even for
bounded input; untrusted replay still requires external time/memory supervision.
No new native implementation, performance claim or M1 exit claim is made.

Focused mathematical fixtures use the already-exposed real cubic of
discriminant 49, `x^4-x-1`, and `x^3-10` (including its nontrivial equation-order
index). Degree ten is covered structurally by preflight tests, not by a claim
of degree-ten mathematical runtime qualification.
