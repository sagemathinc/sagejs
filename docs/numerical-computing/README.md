# Sage.js numerical computing contracts

This directory is the machine-readable public contract for the agent-first
numerical laboratory. The canonical runtime API is `sagejs.numerics`.

The schemas distinguish solver termination from mathematical validation. A
successful backend return is not sufficient: `NumericalResult.success` is true
only when the operation-specific independent validation also passes.

Current production vertical slice:

- scalar roots by bisection, Brent-Dekker, secant, and Newton;
- structured planning, diagnostics, bounded traces, and provenance;
- residual and bracket-invariant validation;
- explanation, verification, refinement, and four-language code emission;
- semantic PlotSpec plots and replayable Plotly-compatible animations; and
- Sage/Python, MATLAB `fzero`, and Wolfram `FindRoot` frontends.

See `surface.json` for the exhaustive classification ledger and
`evidence-policy.json` for routine and release claims.
