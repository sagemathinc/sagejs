# Pinned Python grammar

This directory is the Sage.js build overlay for the MIT-licensed
`tree-sitter-python` grammar pinned to version 0.25.0 in the root package and
lock files. It inherits the complete upstream grammar and scanner, while
keeping the small set of Sage.js correctness fixes reviewable here.

The build always generates and compiles this source to portable WebAssembly;
it never trusts or ships the dependency package's precompiled parser binary.
