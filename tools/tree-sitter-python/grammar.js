/**
 * @file Python grammar overlay for Sage.js.
 * @license MIT
 *
 * Sage.js pins tree-sitter-python 0.25.0 and builds its own portable WASM.
 * This deliberately small overlay corrects the upstream bitwise precedence
 * table while inheriting every other rule and the upstream external scanner.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const Python = require("tree-sitter-python/grammar");

module.exports = grammar(Python, {
  name: "python",
  rules: {
    // `await primary ** exponent` means `(await primary) ** exponent` in
    // Python.  Put await above power while leaving calls/attributes inside
    // its primary-expression operand.
    await: $ => prec(22, seq("await", $.primary_expression)),

    // Upstream assigns postfix operations and await the same binding level.
    // Keeping postfix operations one step higher gives the CPython grouping
    // `await object.method()` while still placing power below await.
    attribute: $ => prec(23, seq(
      field("object", $.primary_expression),
      ".",
      field("attribute", $.identifier),
    )),

    subscript: $ => prec(23, seq(
      field("value", $.primary_expression),
      "[",
      field("subscript", choice($.expression, $.slice)),
      repeat(seq(",", field("subscript", choice($.expression, $.slice)))),
      optional(","),
      "]",
    )),

    call: $ => prec(23, seq(
      field("function", $.primary_expression),
      field("arguments", choice($.generator_expression, $.argument_list)),
    )),

    binary_operator: $ => {
      /** @type {Array<[Function, string, number]>} */
      const table = [
        [prec.left, "+", 18],
        [prec.left, "-", 18],
        [prec.left, "*", 19],
        [prec.left, "@", 19],
        [prec.left, "/", 19],
        [prec.left, "%", 19],
        [prec.left, "//", 19],
        [prec.right, "**", 21],
        [prec.left, "|", 14],
        [prec.left, "^", 15],
        [prec.left, "&", 16],
        [prec.left, "<<", 17],
        [prec.left, ">>", 17],
      ];
      return choice(...table.map(([fn, operator, precedence]) =>
        // @ts-ignore tree-sitter's DSL callable precedence helpers are overloaded.
        fn(precedence, seq(
          field("left", $.primary_expression),
          field("operator", operator),
          field("right", $.primary_expression),
        ))
      ));
    },
  },
});
