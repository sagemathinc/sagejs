# Multilingual generated-code evidence

Sage.js classifies outward numerical code conservatively. The exhaustive
machine-readable audit is [`audit.json`](audit.json). Every one of the 88
operation/language cells is exactly one of:

- **Sage.js self round trip**: Sage.js emits target-shaped code, parses
  the emitted finite-value and callback-expression syntax back into canonical
  numerical intent, regenerates the executable body exactly, checks its
  integrity trailer, and executes the reconstructed intent through the shared
  Sage.js numerical backend;
- **output only**: code may be shown to a person but no round-trip or execution
  claim is made; or
- **unsupported**: emission fails with a structured `unsupported_target`
  diagnostic.

There are currently 63 Sage.js self-round-trip cells, zero output-only cells,
and 25 unsupported cells. The zero is intentional: a catalog emitter is not
allowed to publish a template under a stronger round-trip label. Targets whose
result shape, option semantics, or callable convention is not yet preserved
remain unsupported.

This classification is deliberately not an external-runtime qualification.
The MATLAB and Wolfram bodies also pass their vendored Tree-sitter grammars and
their call, shape, callback, and result conventions are checked against the
official references recorded in [`target-evidence.json`](target-evidence.json).
No MATLAB, GNU Octave, or Wolfram executable was available on the persistent
qualification hosts, so none of these emitted programs has yet been executed
in its named external runtime. The evidence ledger says `not_run` rather than
turning a Sage.js self-test into a vendor-runtime claim.

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
template or comparing strings, but it proves only Sage.js's source-to-intent
path and shared backend. It does not test a vendor parser, solver, defaults,
stopping criteria, or numerical result. External-target qualification requires
separate execution and comparison in that target runtime.

## External-target contract audit

The target-aware test parses every advertised MATLAB and Wolfram body with the
vendored target grammar and enforces original golden assertions derived from
official documentation. In particular it protects:

- nonconjugating column conversion for MATLAB solve and least-squares right
  sides, including complex values;
- row orientation for MATLAB convolution inputs and output;
- the `callback` binding used instead of MATLAB's reserved `function` keyword;
- elementwise `.*`, `./`, and `.^` arithmetic for MATLAB `integral` callbacks;
- column-valued residual and ODE callbacks with one-based state indexing; and
- the full MATLAB descriptive-statistics record, including an explicit R
  type-7 quantile calculation rather than a target-dependent default; and
- target-native result conventions such as Wolfram `FindRoot` rules and the
  single-output MATLAB `ode45` solution structure.

These checks are syntax and interface-contract evidence. They do not establish
that target defaults match Sage.js defaults or that external numerical answers
meet Sage.js validation thresholds. Generated code also returns the target's
natural value or solution object; it does not transport Sage.js's provenance,
diagnostic, trace, or evidence envelope.

## Deliberate limits

- The parser accepts Sage.js-generated programs, not arbitrary user programs.
  Natural MATLAB and Wolfram input is handled by the Tree-sitter frontends.
- Emission currently rejects non-default catalog options unless an emitter can
  preserve them explicitly.
- A MATLAB row vector and a one-row matrix have the same literal syntax. When
  canonical shape would be lost, emission fails closed instead of silently
  changing the problem.
- Callback and root-variable names that are MATLAB keywords, invalid MATLAB
  identifiers, Wolfram patterns, or protected Wolfram constants fail closed.
- Scalar-root code has its older operation-specific parsers rather than an
  attached trailer. Those parsers also derive intent from the emitted syntax,
  and reconstructed roots are now executable from the bounded expression IR.
- `output_only` is reserved in the audit schema for a future intentionally
  documented communication aid. No current public emitter uses it.
