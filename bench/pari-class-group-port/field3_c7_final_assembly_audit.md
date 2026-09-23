# Field 3 C7 final-assembly preparation audit

## Scope

This lane prepares, but does not expose, the final class/unit correspondence
for the frozen mixed quartic `x^4 - 2000022*x - 2000042`.  Its output has
`publicComplete=false`.  It neither invents a public BNF result shape nor
substitutes a historical PARI result tape.

The coordinator authenticates four immutable inputs independently:

- the full terminal ancestry owner, including `A273`, `Ce42`, `T301x15`,
  terminal `H`, state, and physical-row permutation;
- an analytically accepted regulator owner;
- the eventual C5/C6 unit owner, linked byte-for-byte to `A273`;
- the live exact owner of `W`, `C`, `B286`, two `Vbase` descriptors, the
  `288 x 301` relation matrix, exact relation principals, torsion, and
  assumptions.

Every input is a mode-0444 file with an explicit SHA-256. Duplicate JSON keys
are rejected in the Python boundary, and each file is hashed again there to
close the authentication/use interval.

## Exact joins

The join checks the following independent correspondences:

1. `packedTerminal == A + Ce`, and the terminal state is the published
   15-column HNF state.
2. The unit owner contains exactly the full-ancestry `A`.
3. The live owners satisfy `W == H` and `C == Ce`.
4. Each exact relation principal carries the same 288-entry divisor as its
   source relation column.
5. The first 13 columns of `R*T` vanish. The final two columns equal
   `perm^-1(H)`. Only after that complete check are the two 301-entry raw
   principal exponent columns and their 288-entry images published.
6. The existing packed field-3 `cleanarch` transforms `Ce`; the existing
   mixed-quartic class-group assembly derives Smith matrices and maps,
   invariants, class number, ideal generators, exact rational principal
   factors, and archimedean outputs. The analytic and Smith class numbers must
   agree.

Thus the generator-square records are not names attached to selected ideals:
they retain the exact source relation exponents whose divisors are the
terminal order-two columns. The envelope also retains all `B`, `A`, `Ce`,
`Vbase`, Smith/map matrices, ideals, torsion, unit material, regulator
material, and assumptions needed by the future public composer.

## Publication and replay

Preparation writes a canonical, content-addressed JSON envelope through a
same-directory temporary file, rename, and final mode-0444 transition. An
existing object is accepted only when both its digest and mode still agree.
The replay operation reauthenticates all four source owners and the envelope,
reruns cleanarch, Smith/ideal assembly, and exact ancestry, and compares the
complete decoded envelope. It publishes no replacement object.

The focused checker generates a low-cost 192-bit owner analytically. It does
not read an old 192-bit expected tape or an expected result hash. The synthetic
relation matrix and transform make the two terminal images by construction;
the class invariants and maps are then outputs of the existing assembly. The
checker covers CPython, generated JavaScript for the exact witness leaf, cold
replay, idempotence, mode 0444, digest rejection, and semantic mutations of
the transform, H, Ce, regulator acceptance, unit/A join, exact principal
divisor, and Vbase descriptor.

## Deferred authentic boundary

This is intentionally a preparation lane. The authentic `Ce` currently has
153088-bit packed precision, while `pari_field3_packed_class_cleanarch`
explicitly admits 64 through 4352 bits. An authentic cold replay therefore
still requires the high-precision cleanarch extension owned by the native
arithmetic campaign. C5/C6 must also publish their final authenticated unit
owner. Neither missing owner is silently replaced here, and no heavy
high-precision replay was run.
