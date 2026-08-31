# Multilingual numerical intent

`sagejs.numerics.frontends` translates language-specific requests into a
versioned operation record before a numerical domain plans or executes the
request. The record is the interoperability boundary; MATLAB, Wolfram, Sage,
and SciPy spellings are presentation details.

The P6 vertical slice covers scalar roots end to end:

- natural MATLAB `fzero` and Wolfram `FindRoot` runtime calls create the same
  `roots:scalar_root:v1` intent;
- Sage, Python/SciPy, MATLAB, and Wolfram emitters target that intent;
- the four emitted forms parse back to the same semantic digest; and
- opaque live callbacks execute normally but code emission diagnoses
  `non_replayable_intent` instead of fabricating source.

## Record boundary

An intent records the canonical operation, detached operands, normalized
options, requested outputs, and source provenance. Live callback bindings are
held separately and never appear in JSON. `digest` hashes only the semantic
fields, so changing source spelling does not change operation identity.

```python
from sagejs.numerics.frontends import matlab_fzero_intent, emit_code

intent = matlab_fzero_intent(
    lambda x: x*x - 2,
    [1, 2],
    expression="x^2 - 2",
)
print(emit_code(intent, "python-scipy"))
```

The accepted scalar-expression subset contains real literals, symbols,
parentheses, comparisons, arithmetic, powers, and common elementary
functions. It is deliberately smaller than every source language. Unsupported
tokens and functions produce `parse_failure`; they are never passed through as
unchecked source.

## Domain adapter integration

There is no import-time global registry. A domain package publishes one
`OperationAdapter`, and the integration layer composes it explicitly:

```python
from sagejs.numerics.frontends import create_frontend_registry
from sagejs.numerics.integration_adapter import integration_adapter

registry = create_frontend_registry([integration_adapter()])
```

Each adapter owns its aliases, natural lowerers, target emitters, optional
round-trip parsers, and optional executor. Duplicate operations or aliases are
rejected. This lets linear algebra, optimization, differential equations,
spectral methods, and statistics land independently without editing a shared
registry from their worktrees.

## Compatibility and unsupported behavior

Frontend diagnostics have stable codes:

- `unsupported_operation`: no adapter or source alias is registered;
- `unsupported_target`: an operation has no emitter or parser for that target;
- `unsupported_option`: the target cannot preserve an option or method;
- `invalid_frontend_arguments`: natural syntax cannot form a valid operation;
- `non_replayable_intent`: a live value has no serializable expression;
- `parse_failure`: source is outside the checked subset; and
- `semantic_mismatch`: a claimed round trip changed canonical semantics.

MATLAB `fzero` is emitted only for canonical Brent/bracket or Newton/point
requests. Other method requests fail explicitly because native MATLAB `fzero`
does not expose those algorithm identities. Wolfram decimal goal emission is
restricted to exact powers of ten for the same reason.

## Offline references and benchmarks

The test fixture in
`test/numerics/multilingual/fixtures/scalar-root-references.json` records source
URLs, access dates, the API fact used, and the redistribution policy. Tests use
only original inputs and independently known constants; they do not copy or
invoke proprietary vendor output.

`bench/numerics/multilingual/intent-codegen.cjs` reports canonical-record and
four-target translation throughput. It is a representation-overhead benchmark,
not a solver-performance claim.
