# Source quotient projection after the p-radical

`quotient_projection.py` translates PARI 2.17.4 `primedec_aux` from
`FpM_suppl(H|1)` through `FpM_ker(phi2)`. It preserves basis completion,
inversion, the ordered two rectangular products, and exact kernel basis.
The connected `pari_small_radical_quotient` entry computes H and phi from
the integral multiplication table before executing this block, with no host
callback or supplied radical/completion/inverse inside the compiled call.

This is still a dependency checkpoint. H is the **full radical**. In the
Kummer branch, upstream first replaces H with the image of (mb|radical).
That selection, subsequent quotient splitting, and full prime descriptors
are not claimed by this entry. Public dispatch and proof status are unchanged.

## Fidelity and representations

- Matrix image/supplement follow source pivots and original-column order.
  Unlike kernel extraction, p=3 uses the Flm pivot path, not F3m.
- Inversion uses binary packed-column elimination for p=2 and the source
  Flm path for other small primes, with delayed reductions/back substitution.
  Singular input returns -1 instead of source NULL and does not publish an
  inverse. The caller's valid completion must be nonsingular.
- M2 takes columns rank onward from M; Mi2 takes rows rank onward from Mi.
  Their respective packed row strides are n and n-rank. Source negative phi
  diagonal entries are reduced before the modular products.
- Supplement discards dependent columns. Therefore its successful completion
  does not verify the caller's claimed H rank or exclusion of 1. These remain
  explicit mathematical preconditions, along with phi-invariance.
- Workspace uses eleven n² spans plus 2n marker capacity; all published and
  scratch owners are disjoint. Dynamic CPython/JavaScript execute the same
  mathematical source. Dense versus packed representations and explicit
  copies are documented costs, not presumed equivalent memory traffic.

One compiler obstruction appeared in the inverse's binary construction:
mixed machine-word/exact-integer shift operands failed lowering. The explicit
native-bitwise source mode and ordinary `int` conversions preserve the same
bounded shift while making operand types unambiguous. Failed compilations
remain in the CPU ledger; this is not a general compiler fix.

## Evidence

Reproduce with the existing metered 4 GiB wrapper:

```sh
node bench/pari-class-group-port/check_quotient_projection.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz
```

The oracle extracts the literal projection block from pinned `base2.c` and
uses `nfinit`-derived radical inputs; it never obtains a bnf answer. Six fields
at primes 2,3,5,37 give 24 exact checks. Both the projection-only entry and
the integral-table-to-radical-to-projection entry are compared. M, inverse M,
M2, Mi2, phi2, kernel, active tails, input preservation and final state match.
This qualifies correspondence, not performance.

Final receipt: `/tmp/sagejs-quotient-projection-JWrCBE/fixtures.json`, with
both entry points checked in all four execution modes. The cached final
replay used 3.719467 CPU seconds; exact source and oracle identities are
recorded alongside the expected states.

Independent component receipts:

- `/tmp/sagejs-small-prime-basis-vXgvwU/fixtures.json`: 2,304 exact
  image/supplement/pivot cases in CPython, JavaScript, GMP and tagged execution.
- `/tmp/sagejs-small-prime-inverse-ynr3Qc/fixtures.json`: 1,231 cases,
  including 618 singular inputs, exact inverse and mutated elimination state,
  plus invalid-input atomicity across the same execution modes.
- `/tmp/sagejs-pradical-zNjriW/fixtures.json`: previous 24 radical cases and
  256 matrix-product controls still pass after sharing rectangular multiply.

Initial connected native compilation/replay used 23.270084 CPU seconds and
408720 KiB peak child RSS. Core SHA-256:
`f7abfb12124a796be3bc94dd05ee9c68c7752f402e80498b95ab2f47fc814084`.
Independent source/ownership reviews found no blocker. Strict library checking
passes (403 configured modules); broader qualification still has the previously
recorded module-cache failure and stale optimizer-manifest gate, not a green
full-suite result.

## Next source boundary

To split a non-field quotient, preserve source `get_powers`: it constructs
dimension+2 columns, through a^(dimension+1), before `FpM_deplin` stops at the
first dependence. Taking a full kernel and selecting one vector would add
upstream work. The actual quartic residual two-dimensional quotient then needs
the direct quadratic `FpX_roots` branch, including source modular powering
and Tonelli--Shanks. Higher-degree roots have deterministic splitting machinery
still to translate; exhaustive field-element testing is not its replacement.
