# Numerical linear algebra integration record

> Historical handoff, resolved during P2 integration.

The original lane handoff requested shared capability registration,
package-graph ownership, strict-source enrollment, test discovery, status
normalization, and public-export decisions. Integration completed the first
four: all nine public operations are in live capability discovery and the
generated surface, the package has a lazy graph owner, every module is in the
strict Pyright inventory, and `pnpm test:numerics` discovers the linear-algebra
laboratory.

Two boundaries were resolved deliberately rather than by expanding the common
API:

- canonical imports remain under `sagejs.numerics.linear_algebra`; generic
  operation names are not flattened into `sagejs.numerics` where they would
  collide with other planners or make startup eager; and
- `NumericalResult.status` retains the small cross-domain vocabulary, while
  exact domain reasons such as `rank_deficient`, `not_positive_definite`, and
  `determinant_not_representable` remain in the typed result payload and its
  explanation. They use stable common diagnostics where the meanings agree.

Iterative refinement and factorization artifacts likewise remain operations
of the typed linear-algebra result rather than root-specific common-result
methods. Infinite or undefined condition information is represented by a
JSON-safe value plus an explicit condition kind.

There is no active shared integration request in this file. The product-wide
spectral capabilities and the remaining unsupported linear-algebra variants
are classified in `support-matrix.json`.
