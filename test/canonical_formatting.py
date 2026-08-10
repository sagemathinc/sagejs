"""Syntax forms emitted by the canonical Ruff formatter."""

from _import_one import (
    toplevel_func,
)


def call_with_intentionally_long_name_for_parenthesized_condition(value):
    return toplevel_func(value)


def choose_formatted_branch(flag):
    return (
        call_with_intentionally_long_name_for_parenthesized_condition("formatted")
        if flag
        else call_with_intentionally_long_name_for_parenthesized_condition("fallback")
    )


assrt.equal(choose_formatted_branch(True), "formattedtoplevel")
assrt.equal(choose_formatted_branch(False), "fallbacktoplevel")
