/*
 * Reuse the external scanner from the exactly pinned tree-sitter-python
 * package.  The grammar overlay retains the upstream language name, so the
 * scanner's exported tree_sitter_python_* symbols remain correct.
 *
 * tree-sitter-python is MIT licensed.  See ../LICENSE-python.
 */

#include "../../../node_modules/tree-sitter-python/src/scanner.c"
