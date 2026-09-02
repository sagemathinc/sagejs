# Executable multilingual code round trips

Sage.js classifies outward numerical code conservatively. The exhaustive
machine-readable audit is [`audit.json`](audit.json). Every one of the 88
operation/language cells is exactly one of:

- **executable round trip**: Sage.js emits natural target-language code, parses
  the emitted finite-value and callback-expression syntax back into canonical
  numerical intent, regenerates the executable body exactly, checks its
  integrity trailer, and executes the reconstructed intent through the shared
  numerical backend;
- **output only**: code may be shown to a person but no round-trip or execution
  claim is made; or
- **unsupported**: emission fails with a structured `unsupported_target`
  diagnostic.

There are currently 63 executable round-trip cells, zero output-only cells,
and 25 unsupported cells. The zero is intentional: a catalog emitter is not
allowed to publish a template under a stronger round-trip label. Targets whose
result shape, option semantics, or callable convention is not yet preserved
remain unsupported.

## What is actually parsed

The catalog parser is a bounded parser for the exact source subset Sage.js
emits. It reconstructs finite scalar, complex, vector, matrix, and mapping
operands from target syntax. It separately parses scalar, vector, ODE, and
parameter-sweep callback forms and lowers their arithmetic bodies through the
shared expression IR. It does not evaluate source text.

The semantic trailer is not trusted as input. It records an independent digest
cross-check and authenticates the body. Tests re-sign deliberately changed
programs while retaining the old semantic trailer; operand and call changes
are still rejected. This distinguishes a real source round trip from the old
behavior, which decoded the original intent out of the trailer.

The reconstructed expression IR supplies a safe live callback, so the parsed
intent itself is executed. This is stronger than verifying a pretty-printed
template or comparing strings. It also means MATLAB and Wolfram examples can
be qualified without executing proprietary runtimes: their syntax is parsed,
their canonical numerical meaning is executed, and vendor-specific result
conventions remain unsupported until separately qualified.

## Deliberate limits

- The parser accepts Sage.js-generated programs, not arbitrary user programs.
  Natural MATLAB and Wolfram input is handled by the Tree-sitter frontends.
- Emission currently rejects non-default catalog options unless an emitter can
  preserve them explicitly.
- A MATLAB row vector and a one-row matrix have the same literal syntax. When
  canonical shape would be lost, emission fails closed instead of silently
  changing the problem.
- Scalar-root code has its older operation-specific parsers rather than an
  attached trailer. Those parsers also derive intent from the emitted syntax,
  and reconstructed roots are now executable from the bounded expression IR.
- `output_only` is reserved in the audit schema for a future intentionally
  documented communication aid. No current public emitter uses it.
