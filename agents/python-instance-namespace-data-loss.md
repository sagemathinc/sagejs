# Preserve instance fields during namespace self-assignment

A live Python-mode probe on `5a528a28b` confirmed that assigning an instance's
live `__dict__` back to itself erased its attributes. Replacement cleared host
fields before reading the source view; that read refreshed against an empty
object. Materialize and validate source entries before beginning mutation.
This also prevents avoidable erasure when source entry validation fails.

This is a data-preservation repair, not complete CPython namespace semantics.
Assigned-dictionary identity, detached old views, deletion, nonstring keys, and
dict-subclass `items` behavior remain separate representation work. The existing
mapping acceptance/string-key boundary is unchanged; host write/delete failures
after mutation begins are not made transactional. The required upstream object
case is not waived or claimed fixed by this slice.

Focused tests cover self-assignment through ordinary assignment and explicit
`object.__setattr__`, cyclic/mutable values, invalid-source preservation, and
ordinary replacement. Both Python/Sage focused cases and five existing truth
regressions pass. The embedded preservation program also passes CPython 3.14.4.
Architecture checks and full routine validation pass (11m 04s including rebuild
and startup budget), without increasing the core-runtime size ceiling.

The source-current 536-case manifest has the identical outcome vector as its
parent: 522 passes, three reviewed differences, and 11 required assertion
failures. Its unchanged-input guard passes, but the full gate correctly remains
unqualified. Package probes retain eight of eleven passing workflows plus seven
Tomli upstream tests; pyparsing, IDNA stderr, and the mpmath cold timeout remain
open. This Linux x64 validation does not claim four-platform qualification or
any performance-cliff closure.
