# Prepared number-field authentication boundary

The prepared H1 timing adapter used to enforce only an owner-name allowlist:
nonzero values were permitted in the input owners associated with `nfinit`, but
the values were not shown to describe the selected field.  That is insufficient
for an Outcome-C computation because a prepared owner could encode a different
field or an answer-derived multiplication table.

`prepared_nf_authentication.cjs` now fails closed before the prepared owner can
enter either worker.  It checks, using exact `BigInt` arithmetic:

- the monic cubic's discriminant, signature and roots-of-unity count;
- the common-denominator integral basis, its two-sided inverse, degree metadata,
  field discriminant and polynomial-to-field index;
- every one of the 27 multiplication structure constants by multiplication in
  `Q[x]/(f)` followed by exact basis conversion;
- the packed archimedean matrix's ownership alias, normalization, identity
  column, distinct real embeddings and all multiplication identities within a
  conservative error bound derived from the stored precision and tensor height;
- the rounded embedding matrix by exact dyadic nearest-integer conversion; and
- exhaustive admission/analytic prime tables and PARI 2.17.4's cumulative
  `prodprimes()` table, reconstructed from the declared runtime limits.

The authority digest is computed from those live values and returned to callers;
there is no expected digest or class/unit output in the authentication module.
The fixed H1 adapter separately binds the authenticated polynomial to its
selected field identifier.  Its existing whole-input digest consequently binds
the authenticated authority without changing the frozen receipt schema.

The checker mutates each independent boundary.  In particular, it changes an
embedding in both aliases, so that a mere duplicate-buffer comparison cannot
hide a false algebra homomorphism.  The preflight is host-side and excluded from
kernel timing; it authenticates immutable preparation once, before alternating
workers are launched.
