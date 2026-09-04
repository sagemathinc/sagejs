# Foreign-language lowering inspection

`sagejs inspect-foreign` parses a supported foreign language and reports the
shared Sage.js runtime source it would use. It never compiles or executes the
lowered program. The command is available in the source CLI and in both
`sagejs` and `sagepython` single-executable distributions.

Provide exactly one canonical language ID and choose literal source, one file,
or standard input:

```sh
sagejs inspect-foreign --language matlab \
  --source 'linsolve([3 1;1 2],[9;8])'

printf 'NIntegrate[x^2,{x,0,1}]' |
  sagejs inspect-foreign --language wolfram

sagejs inspect-foreign --language matlab program.m
```

Supported language IDs are `magma`, `macaulay2`, `maple`, `matlab`, and
`wolfram`. `--source`, a positional file, and standard input are mutually
exclusive. A positional `-` explicitly selects standard input.

## Stable JSON contract

Standard output contains exactly one compact JSON record using schema
`sagejs.foreign-lowering-inspection/v1`. Successful inspection exits with
status 0:

```json
{"schema":"sagejs.foreign-lowering-inspection/v1","schema_version":1,"success":true,"language":"matlab","input":{"kind":"source","filename":null},"lowering":{"source":"import matlab as _matlab\n...","has_result":true,"loaded_files":[],"attached_files":[]},"error":null}
```

Parser, supported-surface, frontend-load, or internal inspection failure exits
with status 1. The lowering is explicitly null and the diagnostic preserves
the frontend's public error name, message, one-based line and column, and
incomplete-input classification:

```json
{"schema":"sagejs.foreign-lowering-inspection/v1","schema_version":1,"success":false,"language":"wolfram","input":{"kind":"source","filename":null},"lowering":null,"error":{"name":"WolframSyntaxError","message":"Fourier numerical syntax is not supported by the Sage.js Wolfram frontend","line":1,"column":1,"incomplete":false}}
```

CLI misuse exits with status 2 and uses `ForeignInspectionUsageError`; source
positions are null. Repeating `--language` or `--source` is misuse rather than
last-option-wins shadowing. All fields are present on every record. File
evidence is sorted and represented by stable logical basenames, never
host-specific absolute paths. A physical input filename is used privately so
relative Magma `load` and `Attach` directives resolve beside their program;
physical paths are redacted from outward diagnostics.

The reported source is evidence about parser and translation behavior, not an
execution result or a promise that arbitrary generated code is safe to run.
