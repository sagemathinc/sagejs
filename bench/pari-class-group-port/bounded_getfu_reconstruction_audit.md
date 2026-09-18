# Bounded multiple-RHS `getfu` reconstruction

This Phase 4 primitive factors the common reconstruction operation out of the
fixed row-21 and row-23 unit-lattice cuts.  It solves a packed-scalar square
embedding system for one through eight right-hand sides and rounds the result
to integral-basis coordinates.  Both limits are explicit compiler/runtime
bounds rather than inferred promises.

The check generates four synthetic exact units and constructs their embedding
right-hand sides by matrix multiplication.  Thus the expected answers follow
from independent exact arithmetic; no frozen class-group trace, PARI final
unit, or row-specific answer is a runtime input.  CPython executes the ordinary
source body, and the JavaScript, GMP, and tagged compiled backends must return
the same coordinates and diagnostic state.

Publication is fail-closed and transactional.  Invalid shapes, storage, scalar
representations, or declared bit bounds raise.  Singular systems, insufficient
rounding accuracy, nonintegral exact fractions, and oversized reconstructed
coordinates return a nonzero status without changing the caller's output.

This is not yet a complete general `getfu`.  Exponentiation, real/imaginary
splitting, exact unit authentication, inverse normalization, and regulator
index-one certification remain outside this cut.  The value of the primitive
is that rank-three and rank-four callers can share the most repetitive
multiple-RHS solve/reconstruction graph without making their frozen outputs an
authority.
