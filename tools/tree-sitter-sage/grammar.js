/**
 * @file Sage/Python grammar for Sage.js.
 * @license MIT
 *
 * The grammar deliberately inherits the pinned upstream Python grammar.  Sage
 * syntax extensions live here so that Python mode and Sage mode have one
 * explicit, reviewable grammatical difference instead of tokenizer folklore.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const Python = require("tree-sitter-python/grammar");

module.exports = grammar(Python, {
  name: "sage",
  externals: ($, previous) => previous.concat($._sage_integer_prefix),
  conflicts: ($, previous) => previous.concat([
    [$.primary_expression, $.sage_symbolic_function_assignment],
  ]),
  rules: {
    _simple_statement: ($, previous) =>
      choice(
        previous,
        $.sage_generator_assignment,
        $.sage_help_statement,
        $.sage_time_statement,
      ),

    expression_statement: ($, previous) =>
      choice(previous, $.sage_symbolic_function_assignment),

    primary_expression: ($, previous) =>
      choice(
        previous,
        $.sage_ellipsis,
        $.sage_number,
        alias($._sage_integer_prefix, $.integer),
        $.sage_empty_subscript,
        $.sage_generator_access,
        $.sage_integer_attribute,
      ),

    // Python gives ^ bitwise-xor precedence.  Sage instead makes ^ power and
    // spells xor as ^^, so this rule must replace (not merely extend) the
    // upstream table; otherwise the CST groups x^3+x as x^(3+x).
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
        [prec.right, "^", 21],
        [prec.left, "|", 14],
        [prec.left, "&", 15],
        [prec.left, "^^", 16],
        [prec.left, "<<", 17],
        [prec.left, ">>", 17],
        [prec.left, "..", 9],
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

    sage_generator_assignment: $ => seq(
      field("parent", $.identifier),
      ".<",
      commaSep1(field("generator", $.identifier)),
      ">",
      repeat(seq(",", field("additional_target", $.identifier))),
      "=",
      field("value", $.expression),
    ),

    sage_symbolic_function_assignment: $ => prec.dynamic(1, seq(
      field("function", $.identifier),
      "(",
      optional(commaSep1(field("parameter", $.identifier))),
      ")",
      "=",
      field("value", $.expression),
    )),

    sage_empty_subscript: $ => prec(22, seq(
      field("value", $.primary_expression),
      "[",
      "]",
    )),

    sage_generator_access: $ => prec(22, seq(
      field("value", $.primary_expression),
      ".",
      field("index", $.integer),
    )),

    sage_integer_attribute: _ => token(prec(2,
      /[0-9](?:_?[0-9])*\.[_\p{XID_Start}][_\p{XID_Continue}]*/u,
    )),

    sage_help_statement: $ => seq(
      field("expression", $.primary_expression),
      field("detail", choice("?", "??")),
    ),

    sage_time_statement: $ => seq(
      "%time",
      field("statement", $.expression_statement),
    ),

    sage_ellipsis: _ => "..",

    // Sage accepts r/R as an explicit raw-number suffix and combinations of
    // r, l, and j.  The legacy L and j suffixes remain in the Python grammar.
    sage_number: _ => token(choice(
      /(?:0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*|0[oO][0-7](?:_?[0-7])*|0[bB][01](?:_?[01])*|(?:[0-9](?:_?[0-9])*(?:\.(?:[0-9](?:_?[0-9])*)?)?|\.[0-9](?:_?[0-9])*)(?:[eE][+-]?[0-9](?:_?[0-9])*)?)[rR](?:[lLjJ])?/,
      /(?:0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*|0[oO][0-7](?:_?[0-7])*|0[bB][01](?:_?[01])*|(?:[0-9](?:_?[0-9])*(?:\.(?:[0-9](?:_?[0-9])*)?)?|\.[0-9](?:_?[0-9])*)(?:[eE][+-]?[0-9](?:_?[0-9])*)?)[lLjJ][rR]/,
    )),
  },
});

/** @param {RuleOrLiteral} rule */
function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}
