# Hecke complete-request screening worker

This optional developer-only Julia worker is not a Sage.js runtime dependency,
competitive qualification, or an independent certificate verifier. Hecke is
an external capability: if unavailable, report `unavailable`; do not install or
download it silently. No Windows production dependency is added.

Use a provisioned Julia environment containing Hecke and JSON3:

```sh
julia --startup-file=no --project=/path/to/provisioned/environment \
  bench/class-unit-groups/general-frontier/reference/hecke/screen.jl
```

One request per stdin line, one JSON response per stdout line:

```json
{"id":"real-quadratic","coefficients":["-2","0","1"],"bits":100,"iterations":1,"seed":17}
```

Coefficients are ascending exact integer strings. Inputs must be irreducible,
monic and degree at least two. `bits` is 100 or 200; run independent fresh
requests for both. `iterations` batches fresh constructions, not cached answers.
The response retains the last compact result and total elapsed nanoseconds as
an exact string. Repeat `frontier_case(id, coefficients, bits, iterations, seed)`
directly when embedding the worker. Startup and compilation are excluded from
its timer. Warm all representative signatures/ranks before collecting a
persistent-process precompiled-code baseline; a single tiny warmup does not
establish that boundary. External orchestration owns wall-time/memory limits,
CPU affinity, process restart after failures, and version/artifact recording.

## Included boundary

Every timed iteration constructs its polynomial, an uncached number field and
maximal order, complete GRH-conditional class/unit groups, all generator images
and preimages, and compact units including torsion. It obtains factored
principality witnesses for class-generator powers and residuals of all class
generators and the ideals `(2,a)`, `(3,a+1)`, `(5,a-1)`. Probe residuals are
relative to the ideal image of their class coordinate; that representative is
exported explicitly. These probes can be unit ideals and are screening, not
coverage of difficult discrete logarithms.

The regulator is recomputed from factored free generators with eight guard
bits. Its Arb enclosure is exported through outward-rounded BigFloat endpoints
converted to exact rational strings; the exported interval is checked to have
radius less than `2^-bits`. Rank zero has regulator one. The full-group claim
remains conditional on GRH, even though the determinant enclosure is rigorous
for the supplied units. This guarantee is stronger than PARI's approximation
and must be labelled separately, not called a matched PARI enclosure.

All compact JSON serialization occurs before stopping the timer. Element
factors and ideal basis elements are rational power-basis coefficient arrays;
exponents and group coordinates are exact strings. Unit coordinates are in
Hecke order: torsion first, then free generators (PARI places torsion last).
Class invariant-factor ordering can also differ. No expanded units, generic
element evaluation, or floating-point-to-integer reconstruction is used.

Round trips and witness availability are internal screening checks, not
independent proof of unit membership, witness identities or complete maps.
Downstream qualification must check compact ideal identities and unit
membership, generator transition matrices, torsion and regulator accuracy
independently. The payload is an explicit compact screening format, not yet a
detached replay format. Do not count internal assertions as such replay.

## Validation

```sh
julia --startup-file=no --project=/path/to/provisioned/environment \
  bench/class-unit-groups/general-frontier/reference/hecke/smoke.jl
```

The smoke set includes a nontrivial class group, real quadratic, rank-one
cubic, mixed quartic, rank-three biquadratic and torsion-eight cyclotomic field,
at both requested precisions. The worker reports Julia, Hecke and Nemo versions;
record the provisioned environment manifest separately for reproducibility.

The local validation environment used Julia 1.12.7, Hecke 0.39.22 and Nemo
0.56.1. Initial Hecke/JSON3 precompilation took about 185 seconds locally;
these setup costs are not a reference timing. Empty factored ideal residuals
after exact cancellation are handled as the identity because this Hecke
version's `reduce_ideal` rejects an empty factor dictionary.
