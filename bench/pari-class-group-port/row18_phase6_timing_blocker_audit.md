# Row 18 Phase-6 timing source cut

Row 18 already connects the translated initial and retry mathematics, but the
connection is dynamic Python: it deep-copies the complete owner graph, uses
`inspect.signature` to manufacture missing owners, and then calls two separate
roots. It therefore cannot be presented as a resident compiled clock yet.

Run `node bench/pari-class-group-port/check_row18_phase6_timing_blocker.cjs`.
The executable cut authenticates the fresh input, rejects changed authority,
pins both relevant sources, and identifies the typed aggregate root still
needed for a matched clock.

