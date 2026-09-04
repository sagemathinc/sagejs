# P6 integration record

> Historical handoff, resolved during P6 integration.

The P6 runtime owns numerical semantics; TypeScript parser frontends recognize
only qualified natural syntax and lower it to shared runtime operations. They
do not contain numerical algorithms.

Integration completed the original handoff:

- the frontend runtime modules are in the strict Pyright inventory;
- reviewed MATLAB direct functions and Wolfram heads are connected through the
  built parsers and exercised through real sessions;
- unsafe or semantically incomplete natural syntax fails closed with typed,
  positioned diagnostics instead of falling through to a Python name;
- the generated optimizer-opportunity inventory is current; and
- the machine-readable support ledger separately classifies registry aliases,
  natural parser forms, supported emission, and unsupported emission.

The current ledger contains 22 frontend operations and covers every one of its
88 operation/target-language emission cells: 63 are supported and 25 are
explicitly unsupported. A parser rejection is not hidden by a broader registry
claim. MATLAB eigensystem and SVD emission remains unsupported until generated
code can retain every canonical mathematical output rather than MATLAB's
one-output projection.

Domain packages remain independent of MATLAB and Wolfram runtime modules.
Generated source carries an integrity-checked semantic trailer, and checked
parsing accepts only the exact emitted body. Unsupported targets, opaque
callbacks, and unpreserved options produce stable diagnostics rather than
guessed translations.

There is no active shared integration request in this file. Every future
adapter must prove natural result conventions, canonical intent equality,
outward generation or an exact diagnostic, checked round-tripping for the
generated subset, and source-independent execution through the owning result
record.
