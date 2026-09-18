# Native closed-mapping ABI audit

## Outcome

The row-6 mapping fixture now compiles without adding a general dictionary to
the native language. A standard `typing.TypedDict` declaration is lowered as a
closed fixed-layout value. The public adapter validates every required scalar
and copies it once; direct native calls pass the value struct. The isolated
core performs fixed-offset field reads and contains no dictionary, string
lookup, host callback, or ownership transfer.

The dynamic implementation continues to execute the same ordinary Python
subscript source against the caller's mapping. Generated JavaScript normalizes
the three admitted machine scalar kinds (`uint64`, `int64`, and `bool`) before
either dynamic or native execution, so all exported execution tiers share the
boundary checks.

## Deliberate limits

This is not `dict[K, V]` lowering. Compilation rejects:

- arbitrary dictionary annotations;
- undeclared or dynamic keys;
- mapping mutation, construction, return, or retention;
- nested mappings and variable-size field values; and
- scalar fields outside `uint64`, `int64`, and `bool`.

Variable-size class/unit data must use existing explicit packed buffers. The
closed mapping is only the small named scalar manifest around those owners.
This keeps allocation and lifetime visible and bounded.

## Evidence

`test/native-closed-mapping.cjs` checks schema IR, the private call graph,
generated C layout, absence of host machinery in the core, agreement of the
dynamic JavaScript/tagged/GMP paths, boundary extremes, and negative language
cases. The row-6 terminal checker now treats
`row6_phase6_resident_mapping_obstruction.py` as a positive executable proof
and inspects its generated fixed-offset field access.

Focused command:

```bash
node --test test/native-closed-mapping.cjs
```

The remaining row-6 blocker is therefore no longer the scalar mapping
projection itself. The real composers must be decomposed into a closed scalar
manifest plus bounded typed buffers for their nested and variable-size data.
