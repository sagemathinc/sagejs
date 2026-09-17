# Live `h = 1` class-witness suffix

This source-transparent suffix closes the class side of the prepared-root
handoff without reading a resident artifact or accepting an expected class
answer. Its only mathematical inputs are the live relation matrix, accepted
full HNF, and HNF column transform.

The suffix performs, in order:

1. exact `relation * transform = [0 | presentation]` replay;
2. exact inversion of the HNF transform and publication of both directional
   relation/presentation maps;
3. the full Smith transform, including `U`, `Ui`, `V`, and `Vi`;
4. exact `U * presentation * V = I` and both inverse-product checks; and
5. publication of class number one, zero invariant factors, zero generators,
   and zero generator-order witnesses.

The empty generator and order-witness collections are thus mathematically
vacuous only after `D = I` has been proved. They are never input fields.

All arithmetic takes place in scratch owners. The six published square
matrices, two relation maps, and 16-cell terminal state are copied only after
every proof succeeds. Relation, HNF, transform, and nontrivial-class mutations
leave every published cell unchanged in JavaScript, GMP, and tagged execution.

This establishes the internal class correspondence for this `h = 1` prefix
under the separately recorded PARI factor-base/GRH assumptions. It does not
prove the public factor-base theorem or class saturation.
