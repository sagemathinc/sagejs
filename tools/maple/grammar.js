/**
 * Deliberately small Maple grammar for the Sage.js compatibility frontend.
 *
 * This is Sage.js source, not copied from an external grammar.  It covers the
 * executable vertical slice and can grow alongside its regression corpus.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: "maple",

  extras: ($) => [/\s/, $.comment],

  rules: {
    source_file: ($) => repeat($._statement),

    _statement: ($) =>
      choice(
        $.assignment_statement,
        $.expression_statement,
        $.if_statement,
        $.for_statement,
      ),

    terminator: (_) => choice(";", ":"),

    assignment_statement: ($) =>
      seq(
        field("target", $.identifier),
        ":=",
        field("value", $._expression),
        field("terminator", $.terminator),
      ),

    expression_statement: ($) =>
      seq(
        field("expression", $._expression),
        field("terminator", $.terminator),
      ),

    if_statement: ($) =>
      seq(
        "if",
        field("condition", $._expression),
        "then",
        field("body", repeat($._statement)),
        repeat($.elif_clause),
        optional($.else_clause),
        choice("fi", seq("end", "if")),
        optional($.terminator),
      ),

    elif_clause: ($) =>
      seq(
        "elif",
        field("condition", $._expression),
        "then",
        field("body", repeat($._statement)),
      ),

    else_clause: ($) =>
      seq(
        "else",
        field("body", repeat($._statement)),
      ),

    for_statement: ($) =>
      seq(
        "for",
        field("variable", $.identifier),
        optional(seq("from", field("start", $._expression))),
        "to",
        field("stop", $._expression),
        optional(seq("by", field("step", $._expression))),
        "do",
        field("body", repeat($._statement)),
        choice("od", seq("end", "do")),
        optional($.terminator),
      ),

    _expression: ($) =>
      choice(
        $.identifier,
        $.number,
        $.string,
        $.boolean,
        $.list,
        $.set,
        $.call,
        $.parenthesized_expression,
        $.arrow_expression,
        $.unary_expression,
        $.binary_expression,
      ),

    parenthesized_expression: ($) => seq("(", $._expression, ")"),

    list: ($) => seq("[", optional(commaSep1($._expression)), "]"),
    set: ($) => seq("{", optional(commaSep1($._expression)), "}"),

    call: ($) =>
      prec(
        15,
        seq(
          field("function", $._expression),
          "(",
          optional(field("arguments", commaSep1($._expression))),
          ")",
        ),
      ),

    arrow_expression: ($) =>
      prec.right(
        1,
        seq(
          field(
            "parameters",
            choice(
              $.identifier,
              seq("(", optional(commaSep1($.identifier)), ")"),
            ),
          ),
          "->",
          field("body", $._expression),
        ),
      ),

    unary_expression: ($) =>
      choice(
        prec(
          13,
          seq(
            field("operator", choice("+", "-", "not")),
            field("operand", $._expression),
          ),
        ),
        prec.left(
          14,
          seq(
            field("operand", $._expression),
            field("operator", "!"),
          ),
        ),
      ),

    binary_expression: ($) =>
      choice(
        binary($, 2, "implies", "right"),
        binary($, 3, choice("or", "xor")),
        binary($, 4, "and"),
        binary($, 5, choice("=", "<>", "<", "<=", ">", ">=", "in")),
        binary($, 6, ".."),
        binary($, 7, choice("+", "-")),
        binary($, 8, choice("*", "/", "mod")),
        binary($, 9, "^", "right"),
      ),

    identifier: (_) => /[A-Za-z_][A-Za-z0-9_?]*/,
    number: (_) => choice(/\d+\.\d+([eE][+-]?\d+)?/, /\d+([eE][+-]?\d+)?/),
    string: (_) => /"([^"\\]|\\.)*"/,
    boolean: (_) => choice("true", "false", "FAIL"),
    comment: (_) => token(choice(/#[^\n]*/, seq("(*", /([^*]|\*+[^*)])*/, "*)"))),
  },
});

function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}

function binary($, precedence, operator, associativity = "left") {
  const expression = seq(
    field("left", $._expression),
    field("operator", operator),
    field("right", $._expression),
  );
  return associativity === "right"
    ? prec.right(precedence, expression)
    : prec.left(precedence, expression);
}
