# Shared detached replay data

The private `_class_unit_replay_data` module owns the common portable
field/order/prime schema checks and fresh exact reconstruction used by component
and generation replay. It is ordinary CPython-parseable Python, with no native
implementation or producer-authority path. Mathematical imports remain inside
reconstruction, after each caller has checked its complete envelope.

The two callers retain distinct admission policies:

| Input boundary | Component / conditional completion | Generation only |
| --- | ---: | ---: |
| Field degree | 2–4 | 2–10 |
| Supplied factor-base ideals | 32 | 128 |
| Rational prime | 1000 | 1000 |
| Defining rational coefficient numerator/denominator | 32 bits | 32 bits |
| Discriminant magnitude | 128 bits | 128 bits |
| Order/prime basis rational numerator/denominator | 512 bits | 512 bits |

Bit bounds mean magnitude strictly below the indicated power of two; rational
denominators must be positive and pairs reduced. Residue entries remain in
`0..p-1`, with the existing degree-dependent dimensions. Component relation,
presentation, exponent, unit and torsion caps and generation plan/count/memory
caps are unchanged. Generation's wider schema does not widen conditional
completion beyond degree four.

The component JSON parser still rejects booleans and nulls. Only the existing
explicit proof-scalar mode accepts those scalars. Hash binding and all JSON
byte, node, nesting, token, string and container limits remain in their existing
parser; this extraction does not introduce a replacement parser.

Both callers reconstruct a new field and maximal order, compare its exact
fingerprint, decode primes against those new objects, compare their portable
canonical data, and reject duplicate ideals. The shared function takes portable
data only. It cannot accept a producer field, cache, plan, report or token.
Relations, torsion, unit index and generation remain separate existing checks;
the shared layer does not confer mathematical completeness.

## Measured source and generated-code tradeoff

The comparison is against `caaec34aba6899e959cfde8277f180b59424a68b`; the test-only
dependency `d5d62102ae7ceb61c455563020ab9e68e13296a5` has identical replay source.
The post-extraction measurements include **all three** source modules and their
fresh canonical `javascriptTemplate` records:

| Module | Previous Python bytes | Factored Python bytes | Previous JS bytes | Factored JS bytes |
| --- | ---: | ---: | ---: | ---: |
| `class_unit_replay` | 30,027 | 24,839 | 193,159 | 166,562 |
| `class_unit_generation_replay` | 8,823 | 5,076 | 55,627 | 33,177 |
| `_class_unit_replay_data` | 0 | 6,623 | 0 | 65,717 |
| Total | 38,850 | 36,538 | 248,786 | 265,456 |

The net Python saving is **2,312 bytes**, below the review's preliminary 4–5 KB
estimate. Generated JS increases by **16,670 bytes**. This is readable source
factoring, not a generated-code size or runtime-performance improvement.
No source has been minified, omitted from the count, or moved to an unrelated
budget to obscure that tradeoff.

Measurements used the review's `replay-generated-resource-probe-v1.cjs`, forcing
fresh compilation with precompiled caches disabled and checking source SHA-1
against the generated record before canonicalization. Compiler SHA-256 was
`6b62435f11238dadf1f23b6aa002400c1f7d15ad185a4ab079824d6f373b3b56`, matching the
review; compiler version was `7ab186a04312a36c45abce43d56aa5ccb79260b2`.
The final canonical-template SHA-256 values are:

- Component: `379726a3a402b68b1a00a3fa5d7bd72019244c9b2fafc5f79b5480ee076ff5dd`.
- Generation: `fb7e2bb1a62b3073950fb19aed58dd10b9f40d51f9d75c552a6261d2de44ebe6`.
- Shared data: `845a1cce156546033f219d80d148448a671f4f2b0a9f030e19457633668c5bd4`.

At the reviewed global-arithmetic attribution, with other files unchanged, the
source total becomes **1,736,795 bytes**, still 6,795 above the existing 1,730,000
allowance. Integration must register both generation and shared data in that
package and explicitly review any residual allowance. This lane changes neither
package/strict-module registries nor resource caps.

## Verification and limits

The focused replay suites cover fresh reconstruction, missing generation
coverage, duplicate ideals, false bindings, malformed data, no live authority,
conditional index one, the squared-unit control, and the proper relation
sublattice whose recomputed index is eight. The new shared-data suite checks
distinct degree/base boundaries and common bit/residue limits under both
CPython and Sage.js. Its synthetic dimension fixtures establish schema
admission only, not the existence of the encoded fields or prime ideals.
A separate cold-import guard rejects mathematical imports before malformed
envelopes have failed preflight. Existing CPython filename-loaded parser tests
now add `src/lib` to their package search path.

`pnpm test:baselib:strict` covers registered modules. An explicit strict Pyright
invocation and the same strict Ruff rules additionally cover all three replay
files while registration is pending. The first per-file Pyright attempt
identified two unused underscored cross-module boundary functions; those
functions now have ordinary names within the private module and the repeat
check passes, without suppressions or casts.

The merge/changed and architecture gates cannot be reported green before
the integration-owned package registration: the current catch-all
`number-field-algorithms` package exceeds its unchanged source budget. Failed
gate receipts are retained in the task contract; a standalone build does not
repair that attribution. One probe started during compiler rebuilding failed
on the transient compiler state; its failed receipt is retained separately
from the successful measurements above. The isolated fresh compilation probe
is not a packaged build. Full native suites, Windows/portable
qualification, optimizer work, SSH jobs and performance campaigns are outside
this bounded factoring lane.
