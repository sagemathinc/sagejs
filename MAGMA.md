# Experimental Magma frontend

Sage.js includes an early, real parser and compatibility runtime for the Magma
language. Its purpose is to explore a second mathematical-language frontend
for the Sage object model, not to claim complete Magma compatibility.

The frontend parses Magma into a source-located Sage.js-owned AST, lowers that
AST to readable Sage source, and then uses the normal Sage.js compiler:

```text
Magma source
    -> tree-sitter-magma CST
    -> Sage.js Magma AST
    -> Sage source
    -> existing Sage.js compiler and runtime
```

## Trying it

Start a Magma-mode REPL:

```sh
sagejs --magma
```

Execute a file:

```sh
sagejs --magma example.m
```

Show the generated Sage source while executing:

```sh
sagejs --magma --emit-sage example.m
```

For example:

```magma
Q := Rationals();
R<x> := PolynomialRing(Q);
f := x^12 - 1;
Factorization(f);

for n in [2..30] do
    if IsPrime(n) then
        print n;
    end if;
end for;
```

The initial slice supports assignments, single-generator polynomial rings,
ordinary calls, basic aggregates and ranges, arithmetic and comparison
operators, one-based sequence indexing, `print`, `if`, `for`, `while`,
`break`, `continue`, `return`, and source inclusion with Magma's
`load "file.m";`, `Load("file.m");`, and `Attach("file.m");` forms. Relative
filenames are resolved from the file containing the statement, including for
nested loads.

In the interactive REPL, `Attach("file.m");` both evaluates the file and
watches its modification time. The attached file is reevaluated before the
next prompt evaluation after it changes. This deliberately follows Magma's
function-call spelling—Sage's bare `attach` command is not accepted in Magma
mode. The initial implementation treats an attached file as executable Magma
source; package declarations and dynamic filenames such as `Attach(F)` are
future work.

Recognized but unsupported constructs fail with a source position rather than
being translated approximately.

## Intrinsics and dispatch

Magma is organized around global intrinsics selected from the complete
argument-type signature. The compatibility module therefore keeps operations
such as `Factorization` and `IsPrime` as `MagmaIntrinsic` dispatch objects
instead of translating them to methods.

The first registered methods delegate to Sage generic operations. Further
registrations can distinguish every argument and, as the compatibility model
grows, Magma categories in addition to ordinary Python/Sage.js classes.

## Parser source

The grammar is the MIT-licensed
[`tree-sitter-magma`](https://github.com/edgarcosta/tree-sitter-magma)
repository by Edgar Costa and Håvard Damm-Johnsen, pinned as the
`upstream-tests/tree-sitter-magma` submodule. Its revision is part of the
Sage.js source tree and must be updated deliberately.

Clone with submodules before building:

```sh
git clone --recurse-submodules https://github.com/sagemathinc/sagejs.git
```

For an existing checkout:

```sh
git submodule update --init --recursive
```

The build compiles the grammar to Wasm and packages it with the Tree-sitter
Wasm runtime. This avoids making the Magma frontend depend on a
platform-specific Node native addon, works in single-executable
distributions, and keeps the parser backend suitable for future browser
integration.

## Next compatibility inputs

Two closely related upstream projects are useful when this proof of concept
grows beyond its initial executable examples:

- [`havarddj/lava`](https://github.com/havarddj/lava) provides realistic
  Magma-language material that can inform a pinned compatibility corpus.
- Edgar Costa's
  [`magma_kernel` x-protocol branch](https://github.com/edgarcosta/magma_kernel/tree/feat/x-protocol)
  explores a richer Magma/Jupyter protocol and should be reviewed before
  Sage.js invents additional language-specific kernel messages.

These are recorded as design and test inputs, not vendored dependencies.
