# PR #114 integration corrections

Prepared separately from the main-based merge stack, on source `5b6ffb507`.
This branch is not a release or a claim that integration onto main is complete.

- Replace factorial-time Laplace expansion in the bounded Jacobian minor
  path with division-free subset dynamic programming. The bound remains eight;
  the algorithm uses O(n 2^n) operations and works in positive characteristic.
- Guard Hilbert allocation before constructing its coefficient array, and stop
  polynomial differentiation immediately when the result becomes zero.
- Retain ambient-parent identity with weak cache values and identity-checked
  finalization. Never evict a parent still retained by a point or scheme.
- Validate the complete multivariate divisor array and checked allocation size
  before borrowing native polynomial pointers.
- Reject invalid plane curves without rejecting their legitimate empty affine
  patches. Finite-coordinate enumeration explicitly supports prime fields;
  extension fields fail before enumeration or quotient-basis construction.
- Keep bounded candidate enumeration incremental, deduplicate separators, and
  propagate arithmetic failures during quotient equality.

Qualification of these corrections: original eight-stage build, a rebuilt
native FLINT addon, then compiler/runtime refresh after the cache-cleanup fix;
all nine geometry fixtures and both malformed-ingress tests pass. Strict Python
passes for 376 modules, Ruff formatting passes, and merge-owned inventories and
native architecture checks pass. Separate CPython execution of the actual
Jacobian/Hilbert source provided randomized exact reference checks during review.
No cross-platform timing or final main CI result is claimed here.

The integration preparation also restores main's eager browser size ceilings
(17,400,000 gzip / 9,600,000 Brotli bytes). The PR's small increases are not
needed as a merge policy: the main-based stack removes unused compiler-cache
variants, and the combined browser artifact must fit the original ceilings.
This is a stricter acceptance contract, not a claim that this isolated branch
has a freshly qualified browser artifact at those limits.
