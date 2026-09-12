# Ordered keyword groups: producer integration checkpoint

This is an incomplete producer/projection patch, not a public keyword-semantics
fix. It starts directly from main `02a683d213072c3129da1f71e2aa47de447cfc4a`.
No PR260 emitter or lowerer changes are imported. The final integration needs
the coordinated emitter/runtime consumer and fresh qualification; until then,
the old emitter still groups mappings before explicit keywords.

## Metadata contract

Call argument arrays retain their existing expression owners, `kwargs` and
`kwarg_items`. The new `keyword_groups` sidecar contains only index metadata:

```json
[
  {"kind": "explicit", "start": 0, "count": 2},
  {"kind": "mapping", "index": 0},
  {"kind": "explicit", "start": 2, "count": 1}
]
```

This describes `f(a=A, b=B, **M, c=C)`. Each mapping is its own group;
consecutive explicit keywords form one group. A positional/starred argument
between explicit keywords does not split that keyword group: Python evaluates
the positional argument vector separately. There are no duplicated AST nodes
and the existing AST walker visits each expression once.

`lowerCall` records groups while reading the CST. The only other explicit-call
keyword append found in the producer audit is `lowerSageGeneratorAssignment`;
it now uses the same append method so its synthesized `names=` belongs to the
last explicit group or starts a new group after a mapping. Parameter-declaration
`args.kwargs` is a different representation and is unchanged. Synthetic calls
with no keywords require no nonempty metadata.

AST cloning retains the argument array; workspace-bundle projection clones
arrays and explicitly preserves this sidecar alongside the existing kwargs,
kwarg_items, and starargs. Existing positional-only optimizer checks continue
to inspect the original expression arrays. Group metadata itself is plain
JSON, but JSON-stringifying an argument array alone does not preserve sidecars;
no new full-AST wire format is introduced or claimed.

The inspected Python module cache stores emitted outputs plus module metadata,
not serialized call ASTs. Its compiler-version/source-signature checks remain
required. A consumer must not guess source order for mixed-kind historical
ASTs without metadata. Ordinary CST calls supply it; no-keyword and single-kind
synthetic ASTs are unambiguous. Any old grouped fallback must be confined to an
explicit private bootstrap path rather than silently used for strict Python
mixed-keyword calls. Consumer enforcement is still pending.

## Consumer handoff and required gaps

Emit nested `append(previousPacket, nextGroupExpression)` so each prior merge
finishes before evaluating the next group. A consecutive explicit run must
evaluate all its values before that group's duplicate check. Extracting the
existing one-source merge loop permits incremental construction without
quadratic copying. Plain compiler packets must use direct data reads, not
invoke values named `keys` or `__getitem__`; explicit names need computed object
keys so `__proto__` remains data. The diagnostic proposal measured about +92
UTF-8 runtime-source bytes before formatting/docs; natural shared-code room and
a final source-budget audit are required, not a budget increase.

Sole-star calls need star-expression evaluation before keyword groups but
iteration after successful keyword merging. Multiple-star/positional-prefix
cases have a different iteration schedule. Keep user expressions outside any
new IIFE to preserve yield/await scope. PR260 generator-definition integration
must cover this cross-product; it is not included in this producer checkpoint.

Non-string mapping-key validation order remains a **required unresolved gap**.
CPython can fetch a non-string key's value and evaluate later keyword groups
before rejecting the call. Moving the existing early check is insufficient:
the JS packet cannot preserve distinct non-string/string keys and duplicate
ordering. This patch neither fixes nor waives that separate representation
problem and cannot claim complete CALL_FUNCTION_EX semantics.

## Source-level validation

```sh
SAGEJS_KEYWORD_GROUP_COMPILER_ROOT=/path/to/read-only/compiler-root \
  node test/python-ordered-keyword-groups.cjs
```

The test compiles this checkout's TypeScript lowerer in memory and borrows only
parser/AST dependencies from the explicit seed. Without an override it requires
this checkout's dist. It compares grouping with CPython 3.14, checks one-time
expression traversal, cloning, JSON metadata, both Sage generator append
shapes, and actual workspace projection with a workspace schema. This is not
a build receipt or final consumer qualification.
