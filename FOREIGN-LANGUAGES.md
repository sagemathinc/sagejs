# Experimental mathematical-language frontends

Sage.js includes small proof-of-concept frontends for Magma, Macaulay2, the
Wolfram Language (Mathematica), MATLAB, and Maple. Each frontend parses its own syntax
into a typed language-specific AST, lowers that AST to ordinary Sage source,
and then uses the same Sage.js compiler and mathematical runtime as Sage mode.
The generated Sage source is an intentional boundary: `--emit-sage` makes the
translation inspectable.

These frontends demonstrate language interoperability; they are not claims of
complete compatibility and are not affiliated with the language vendors.
Unsupported syntax fails explicitly instead of being guessed.

Within an embedding or the Sage.js Polyglot Jupyter kernel, every frontend
uses one live object namespace. See [`POLYGLOT.md`](POLYGLOT.md) for the
shared-object contract, native introspection operations, compatibility matrix,
and executable cross-language corpus.

## Running them

Use one language flag with a file, standard input, or the REPL:

```sh
sagejs --wolfram examples.wl
sagejs --mathematica examples.wl
sagejs --matlab examples.m
sagejs --maple examples.mpl
sagejs --magma examples.m
sagejs --macaulay2 examples.m2
sagejs --m2 examples.m2
```

`--mathematica` is an alias for `--wolfram`. File extensions are not used for
automatic detection because `.m` is shared by several mathematical systems.

Add `--emit-sage` to display the generated Sage source before executing it.

## Initial compatibility slices

The Wolfram frontend covers ordinary expressions, lists, immediate and simple
delayed assignments, patterned function arguments, `Table`, `Range`,
`FactorInteger`, `Prime`, `PrimePi`, and `Plot`. `(* ... *)` comments are
skipped wherever they appear, including nested ones, and chains of comparison
operators (`a <= x <= b`) mean what they mean in Wolfram -- one relation about
all the operands, not a left-associative pair of them. The numerical
optimization heads are documented separately in [`PARITY.md`](PARITY.md).

The MATLAB frontend covers scalars, matrices, assignment/output suppression,
colon ranges, arithmetic and matrix operators, one-based scalar indexing,
selected NumPy functions, and two-vector `plot`.

The Maple frontend covers expressions, lists and sets, `:=`, arrow functions,
`seq`, inclusive loops, conditionals, selected number-theory functions, and
expression/range `plot`.

Magma has the broadest initial slice, including type-directed intrinsics,
polynomial generator declarations, control flow, and `load`/`Attach`; see
[`MAGMA.md`](MAGMA.md).

The Macaulay2 slice covers arithmetic and adjacency calls, assignments and
semicolon suppression, polynomial rings such as `R = QQ[x,y]`, ideals,
Groebner bases, generators, dimensions, degrees, and shared Sage values.
`--m2` and `%%m2` are aliases for `--macaulay2` and `%%macaulay2`.

## Parser provenance

- Wolfram syntax uses the official
  `WolframResearch/tree-sitter-wolfram` grammar pinned at
  `aec1c3ecdaf99fb918019adcfeb02765e10b51a8`.
- MATLAB syntax uses `acristoffers/tree-sitter-matlab` pinned at
  `c9ef947ec67fb6b500d5def4f5e09b56990a9f91`.
- Magma syntax uses `edgarcosta/tree-sitter-magma`; see `MAGMA.md`.
- Macaulay2 syntax uses `AlexanderGolys/tree-sitter-macaulay2` version 4.0.1.
- The deliberately small Maple grammar lives in `tools/maple`. It is expanded
  only alongside executable compatibility tests.

The generated distribution includes the parser Wasm modules, and the
single-executable distribution embeds the same assets.
