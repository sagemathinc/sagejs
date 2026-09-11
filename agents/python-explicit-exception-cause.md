# Explicit exception causes

The authoritative lowerer discarded the `cause` field of `raise_statement`.
On the retained `a6b3e2cf1` integration artifact, raising a `RuntimeError` from
a saved `ValueError` produced false cause identity and false suppression.

The compiler now retains and walks the cause expression and emits its binding
only for an explicit `from`. Both expressions run once, in source order, before
exception-class construction. Existing exception normalization is reused;
`__cause__` and `__suppress_context__` are assigned without overwriting context.
No exception-runtime source is changed. General implicit-context lifecycle
tracking and broader exception-normalization compatibility remain outside this
bounded repair.

The CPython 3.14.4 oracle and both Python/Sage runtime cases pass. Coverage
includes cause identity, `from None`, preservation of an existing context,
bare re-raise identity, class causes, expression/constructor evaluation order,
throwing cause expressions, invalid-value `TypeError`, and closure variables.
Thirteen kernel/CLI diagnostic and inherited-exception tests pass. Strict Python
checking passes with zero errors across 385 modules; architecture and merge
checks pass after refreshing generated source evidence. Runtime core remains
897823/903000 bytes, with no source-size delta.

The unchanged frontend suite reports 61 pass / 5 fail on both this compiler and
the retained integration artifact; those existing prepared-call output-shape
failures are assigned separately. Self-hosting converges, but the full build
stopped during module-cache publication because the requested standalone
`sagejs.number_fields.riemann_zeta` cache file was absent. No full-build pass,
complete corpus result, or ready status is claimed for this slice.
