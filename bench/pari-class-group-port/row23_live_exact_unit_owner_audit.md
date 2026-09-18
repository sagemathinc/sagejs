# Row 23 live exact unit owner

This closes row 23's previously explicit C6 blocker without importing any
frozen unit. The live rank-four `getfu` candidate retains seven cells per real
place: a real logarithm and a phase. Although the field is totally real, unit
embeddings may be negative, so phases equal to odd multiples of pi are
mathematically essential. Exponentiating real parts alone produced absolute
embedding values and failed exact unit authentication, as it should.

`row23_totally_real_getfu.py` instead applies the translated mixed exponential
to all twenty full packets, checks the imaginary residual, sends the twenty
real embedding values to the existing bounded 5-by-5/four-RHS solver, rounds,
and authenticates every result using its exact multiplication matrix. The
successful live state is `[0,20,0,4,13,3]`; reconstruction state is
`[0,5,4,-222,4]`. The inverse mask is 13.

The four published integral-basis units are:

```text
[-1, 1, 0, 0, 0]
[-11, -3, -2, 1, -1]
[-5, 1, 0, 0, 1]
[93568, 20858, 10338, -7099, 7052]
```

Each unit has determinant/norm `+1` or `-1`, and its computed cofactor inverse
multiplies back to one. Publication occurs only after all four exact checks.
The owner retains all four exact inverses, signed norms, five real signs per
unit, the 4-by-9 relation-to-unit transform, 4-by-4 private `getfu` factor,
the output-aligned packed logarithms, all rank-four stage states, and hashes
binding the regulator and complete acceptance authority.
The coordinator writes canonical JSON through deterministic gzip, makes the
artifact read-only, and binds both plain-content and compressed SHA-256
digests. The checker rejects both content and state mutations.

Run:

```bash
node bench/pari-class-group-port/check_row23_live_exact_unit_owner.cjs
```

The frozen W0 unit event is opened only after live reconstruction, exact
verification, immutable publication, and mutation tests finish. It supplies
no runtime logarithm, phase, embedding RHS, rounded coordinate, or unit.
Timings remain diagnostic and unqualified.
