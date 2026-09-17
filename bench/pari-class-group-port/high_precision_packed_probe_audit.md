# 153,088-bit packed arithmetic feasibility audit

## Question and boundary

This probe asks one narrow question: can the ordinary CPython-parseable packed
Python/GMP graph execute neutral real and complex constant/logarithm/exponential
work at the precision required by the retained mixed-quartic `A13` case?

The target is **153,088 bits**. It is a conservative whole-word target, not a
claim about an exact mathematical or PARI threshold. The motivating fresh PARI
2.17.4 observations were:

- `realprecision=45900` selected `realbitprecision=152512` and emitted the
  `getfu` insufficient-precision warning;
- `realprecision=46050` selected `realbitprecision=153024` without that warning.

Those observations used `bnfinit(x^4-2000022*x-2000042,1)`, but **no field
answer, unit, regulator, relation, or other answer-derived datum enters these
probes**. The inputs are only `pi`, `log(2)`, `exp(log(2))`, and
`exp(log(2)+i)`.

This is not a `getfu` closure claim. It tests only the bounded packed primitives
and their transitive precision validators.

## Oracle authority

The exact oracle is a pristine PARI 2.17.4 tree and library:

- release archive SHA-256:
  `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`;
- `src/basemath/trans1.c` SHA-256:
  `287fbc089af72e8abcae073ea059880fdb138d7b4cd3c2bea39be547f3ca7835`;
- separately audited `src/basemath/buch2.c` SHA-256:
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.

The checker compiles a small C oracle against that tree. It compares the packed
mantissa, bit precision, and exponent as integers, not decimal approximations.

## Justified capacity changes

At 153,088 bits, PARI's atanh series selection for `log(2)` requires about
16,292 terms; pi requires about 3,250. Therefore the reviewed binary-splitting
boundary is 16,384 terms and 105 stack entries (15 frames times seven entries).
The precision corridor is 154,112 bits, retaining up to 1,024 guard bits above
the root target. All public roots accept only the exact 153,088-bit target.

Caller-owned storage is validated before any output or state mutation:

- four coefficient buffers of 16,385 entries;
- 105 binary-splitting stack entries;
- three-entry resident pi and log caches;
- nine real-stage or fifteen complex-stage output integers;
- four signed state entries.

Dynamic fallbacks remain the same source functions. The new roots reject both
undersized storage and the nearby 153,024-bit non-target input transactionally:
the caller's output and state remain unchanged.

## Resource policy and results

Each backend was compiled and run alone. The parent monitor sampled aggregate
process-tree RSS every 250 ms, killed the process tree above 3.5 GiB, imposed a
4 GiB address-space hard limit, and enforced a 600-second timeout.

| probe | exact triples | native arithmetic | total wall | peak aggregate RSS | core C | addon |
|---|---:|---:|---:|---:|---:|---:|
| real: pi, log(2), exp(log(2)) | 3 | 186.853 s | 211.997 s | 1,189,244 KiB | 5,563,198 B | 1,272,480 B |
| complex: the real probe plus exp(log(2)+i) | 5 | 380.346 s | 404.537 s | 1,249,252 KiB | 5,569,766 B | 1,272,480 B |

Every packed triple agrees exactly with pristine PARI. Both runs are below the
memory and time limits, and both negative controls preserve caller output.
Machine-readable hashes and measurements are frozen in
`high_precision_packed_probe_result.json`.

An initial candidate `exp(log(2)+pi*i)` was deliberately discarded. Supplying
the independently rounded packed pi value to the trig reduction makes an exact
mathematical cancellation appear as a tiny nonzero residual. Faithfully
resolving that residual requests roughly twice the target precision. This is a
pathological constant-identity test, not representative evidence about the
153,088-bit corridor. Replacing it with the equally neutral `exp(log(2)+i)`
keeps the complex graph real without importing any field answer data.

## Conclusion and stop point

The bounded G2 feasibility question is answered positively for these neutral
primitives: source-transparent packed Python/GMP arithmetic can execute the
required real and complex precision under the stated 4 GiB/10-minute envelope.
This does not establish field-owner, relation, regulator, or `getfu` closure.

The experiment stops here. If a later field-specific owner/reconstruction stage
cannot stay within the same explicit resource envelope, the narrow pivot is an
Arb/Acb host adapter for certified high-precision transcendental evaluation,
while retaining packed Python for ownership, exact arithmetic, and replay. It
is not justification for an opaque wholesale replacement of the graph.
