/*
 * Reuse the scanner from the pinned tree-sitter-python package.  Tree-sitter
 * gives external-scanner symbols the grammar name, so remap those symbols for
 * the derived Sage grammar before including the upstream implementation.
 *
 * tree-sitter-python is MIT licensed.  See ../LICENSE-python.
 */
#define tree_sitter_python_external_scanner_create sage_python_scanner_create
#define tree_sitter_python_external_scanner_destroy sage_python_scanner_destroy
#define tree_sitter_python_external_scanner_scan sage_python_scanner_scan
#define tree_sitter_python_external_scanner_serialize sage_python_scanner_serialize
#define tree_sitter_python_external_scanner_deserialize sage_python_scanner_deserialize

#include "../../../node_modules/tree-sitter-python/src/scanner.c"

enum SageTokenType {
    SAGE_INTEGER_PREFIX = 12,
};

bool tree_sitter_sage_external_scanner_scan(void *payload, TSLexer *lexer,
                                             const bool *valid_symbols) {
    /*
     * Python tokenizes `1..9` as two floats.  Sage instead needs the integer
     * `1` followed by its `..` range operator.  An external token can mark the
     * integer's end after looking far enough ahead to distinguish this one
     * case.  All other input is delegated unchanged to Python's scanner.
     */
    if (valid_symbols[SAGE_INTEGER_PREFIX] &&
        lexer->lookahead >= '0' && lexer->lookahead <= '9') {
        do {
            lexer->advance(lexer, false);
        } while ((lexer->lookahead >= '0' && lexer->lookahead <= '9') ||
                 lexer->lookahead == '_');
        lexer->mark_end(lexer);
        if (lexer->lookahead == '.') {
            lexer->advance(lexer, false);
            if (lexer->lookahead == '.') {
                lexer->result_symbol = SAGE_INTEGER_PREFIX;
                return true;
            }
        }
        return false;
    }
    return sage_python_scanner_scan(payload, lexer, valid_symbols);
}

void *tree_sitter_sage_external_scanner_create(void) {
    return sage_python_scanner_create();
}

void tree_sitter_sage_external_scanner_destroy(void *payload) {
    sage_python_scanner_destroy(payload);
}

unsigned tree_sitter_sage_external_scanner_serialize(void *payload,
                                                      char *buffer) {
    return sage_python_scanner_serialize(payload, buffer);
}

void tree_sitter_sage_external_scanner_deserialize(void *payload,
                                                    const char *buffer,
                                                    unsigned length) {
    sage_python_scanner_deserialize(payload, buffer, length);
}
