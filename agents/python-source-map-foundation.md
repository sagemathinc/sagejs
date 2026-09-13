# Python source-map foundation

This is a first Node source-coordinate foundation, not completion of the M4
traceback semantics milestone. It does not establish general traceback-sensitive
package compatibility.

## Supported execution paths

Python CLI file execution and freshly compiled or locally cached lazy Python
modules register exact emitted maps against actual `vm.Script` identities before
execution. Each Script has a unique opaque URL; logical filenames are not keys.
Old functions retain their own registered source-line snapshots after filename
reuse. Serialized local maps are validated before cache acceptance; malformed
maps regenerate. V8 bytecode rejection refreshes the cache without replacing the
registered executable. Valid bytecode can be reused across opaque URLs.

Wrappers use explicit text-edit relocation, never guessed line offsets. Map
coordinates use one-based lines and zero-based UTF-16 columns; the Node stack
adapter converts V8's one-based columns. Conservative AST Call/New/Throw sites
are mapped. Defaults and decorators retain enclosing function ownership; body
names are unqualified `co_name` values. Class/comprehension ownership is not yet
modeled and names are withheld. Synthetic invalid/missing coordinates are
explicitly unattributed, not borrowed from enclosing calls.
Exact full-function scope barriers (including generated binder/prologue) prevent an enclosing call such as
`invoke(lambda: 1 + None)` from claiming the nested body's unmapped operation.
These barriers permit genuine in-body execution spans; absolute exclusions do
not. Both kinds are serialized and validated explicitly.
Unmodeled class/comprehension ranges also form conservative barriers, including
generated generator-expression activations. Deeper genuine sites remain mapped
with withheld names; an unmapped generator operation cannot inherit its outer
creation call's attribution. This does not add generator traceback-state support.

Portable precompiled modules, browser, REPL/kernel, dynamic compilation, and
standalone/foreign execution paths are not integrated. Their frames, and misses
within registered Scripts, retain truthful generated/native locations and
provenance. An explicit source exclusion is not evidence that a frame can be
erased. In particular, unmapped body operations such as `return 1 + None` must
remain distinguishable from argument-binding failures. Only initial known
current-stack invocation trampolines are omitted; exception-stack trampolines
are retained. The private capture hook exposes records, not a mutable registry.

## Capture-stack contract and remaining incompatibilities

`traceback.extract_stack` and `extract_tb` consume capture-time V8 stacks, not
Python traceback chains delimited by exception propagation. V8 stack-depth
limits still apply. The `frame` argument to `extract_stack` is ignored. This
foundation does not establish reraising, exception-chain, or traceback mutation
semantics, nor replace all diagnostic formatting paths.

The retained legacy `extract_tb` positive limit takes the last N capture frames;
CPython takes the first N traceback frames. Negative limits also differ because
host capture frames remain. Zero returns no frames. The focused CPython oracle
reports this known gap rather than claiming differential conformance. For a
module calling `middle`, which calls raising `leaf`, CPython's limit 2 yields
`['<module>', 'middle']`, whereas current Sage.js yields `['middle', 'leaf']`.

The unchanged pinned pyparsing 3.3.2 workflow passes with exact call coordinates,
but its arity probe still relies on the retained last-N capture-stack behavior.
Removing the former hardcoded `-3` correction is sound; changing the slice alone
would not establish correct Python semantics. This package smoke is not proof
of fully correct traceback-sensitive package support.

## Cost and lifetime observation

The collector prepares line-start indexes once per text validation, avoiding
per-node prefix scans. Registry lookup currently scans spans linearly, suitable
for occasional capture but not a qualified traceback-heavy performance result.
The Node URL-to-Script registry strongly retains all registrations for process
lifetime, including failed imports. Each retains original text, generated text,
and spans. There is no reset/disposal mechanism or finite retention bound across
distinct scripts. This preserves old live closures but needs a future ownership
design for long-lived dynamic execution.

A same-process alternating observation used pinned pyparsing/core.py and the
same compiler, six fresh parse/emission pairs. Map-on also included finish, JSON
serialization, wrapper relocation and registration. Milliseconds were:

This observation preceded the explicit function-scope-barrier correction; it
does not measure the final barrier-bearing representation.

- Map-off: 5943, 5979, 5619, 5541, 5696, 5354; median 5657.5.
- Map-on: 5938, 5991, 5589, 5595, 5697, 5574; median 5646.

Noise dominates; this is neither a speedup claim nor an isolated cold-import or
throughput benchmark. Simplified emission flags produced 1634 spans, 251832
source UTF-16 units, 1464240 generated units, and 2125440 serialized map units.
CLI flags can produce a different span count. Serialized size is not retained
heap size, and source/generated text is duplicated in the local cache envelope.

## Separate synchronous traceback follow-up

The next tranche must represent actual propagation and handled-exception state,
not infer boundaries from frame names. Proposed bounded work:

1. Extend raise IR/lowering to distinguish a new raise, explicit `raise e`, bare
   reraising, and explicit cause/suppression. Current first-child raise lowering
   and lexical catch-depth selection are insufficient.
2. Give synchronous activations and handlers exact identities. Enter a callee's
   Python activation only after argument validation; binder errors belong to
   the caller. Delimit traceback propagation by handler ownership, preserving
   unknown foreign-origin frames as generated/native.
3. Restore dynamically scoped handled-exception state in handler `finally`
   paths. Current shared last-exception state must not leak across nested
   handlers. Preserve exception aliases, nested restoration, context, explicit
   cause and suppression with CPython differential oracles.
4. Preserve the distinctions demonstrated by CPython: same-handler bare raise
   retains the original raise site; explicit `raise e` prepends the explicit
   site; bare raise through a helper omits that helper's own reraising frame but
   prepends the caller's helper-call site. Simple activation/name deduplication
   cannot implement these rules.
5. Avoid per-call object allocation or stack capture: evaluate compact numeric
   activation stacks and lazy traceback construction only on exceptions.
   Measure no-error calls, recursion, and throw/catch costs before accepting a
   design; activation entry/exit still adds hot-path work. Lazy capture alone
   cannot recover already-unwound ownership without recorded state.

Generator and async suspension require separate continuation ownership and are
explicitly outside this synchronous follow-up. Its review and implementation
should remain separate from this source-map foundation.
