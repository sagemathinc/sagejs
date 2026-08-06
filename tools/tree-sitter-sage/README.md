# tree-sitter-sage

This is Sage.js's authoritative Sage-language grammar.  It derives from the
MIT-licensed `tree-sitter-python` grammar pinned in the root `package.json` and
adds only Sage syntax.  Ordinary Python remains governed by the unmodified
upstream grammar.

The build uses the portable WebAssembly Tree-sitter runtime on every platform;
the optional native Node binding shipped by `tree-sitter-python` is not used.
