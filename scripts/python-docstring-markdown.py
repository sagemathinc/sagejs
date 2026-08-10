"""Normalize Markdown markup inside first-party Python docstrings.

The public command is the Node wrapper `python-docstring-markdown.cjs`.  It
passes a JSON list of repository-relative files on standard input so this
helper works on Windows without overflowing the command-line length limit.
"""

from __future__ import annotations

import argparse
import ast
import json
import pathlib
import re
import sys


EXACT_DOUBLE_BACKTICKS = re.compile(r"(?<!`)``(?!`)")


def docstring_expressions(tree: ast.AST) -> list[ast.Expr]:
    expressions: list[ast.Expr] = []
    owners = (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)
    for node in ast.walk(tree):
        if not isinstance(node, owners) or not node.body:
            continue
        expression = node.body[0]
        if (
            isinstance(expression, ast.Expr)
            and isinstance(expression.value, ast.Constant)
            and isinstance(expression.value.value, str)
        ):
            expressions.append(expression)
    return expressions


def character_column(line: str, utf8_column: int) -> int:
    """Translate CPython AST's UTF-8 byte column to a string index."""

    return len(line.encode("utf-8")[:utf8_column].decode("utf-8"))


def source_offsets(source: str, node: ast.Expr) -> tuple[int, int]:
    lines = source.splitlines(keepends=True)
    starts: list[int] = []
    offset = 0
    for line in lines:
        starts.append(offset)
        offset += len(line)
    start_line = lines[node.lineno - 1]
    end_line = lines[node.end_lineno - 1]
    start = starts[node.lineno - 1] + character_column(start_line, node.col_offset)
    end = starts[node.end_lineno - 1] + character_column(end_line, node.end_col_offset)
    return start, end


def exact_double_locations(
    path: str, source: str, spans: list[tuple[int, int]]
) -> list[str]:
    locations: list[str] = []
    for start, end in spans:
        for match in EXACT_DOUBLE_BACKTICKS.finditer(source, start, end):
            before = source[: match.start()]
            line = before.count("\n") + 1
            previous_newline = before.rfind("\n")
            column = match.start() - previous_newline
            locations.append(f"{path}:{line}:{column}")
    return locations


def normalize(source: str, spans: list[tuple[int, int]]) -> str:
    for start, end in sorted(spans, reverse=True):
        docstring = source[start:end]
        source = (
            source[:start] + EXACT_DOUBLE_BACKTICKS.sub("`", docstring) + source[end:]
        )
    return source


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--fix", action="store_true")
    arguments = parser.parse_args()

    root = pathlib.Path.cwd()
    paths: list[str] = json.load(sys.stdin)
    failures: list[str] = []
    changed = 0
    for path in paths:
        filename = root / path
        source = filename.read_text()
        tree = ast.parse(source, filename=path)
        spans = [source_offsets(source, node) for node in docstring_expressions(tree)]
        locations = exact_double_locations(path, source, spans)
        if not locations:
            continue
        if arguments.check:
            failures.extend(locations)
            continue
        filename.write_text(normalize(source, spans))
        changed += 1

    if failures:
        print(
            "Python docstrings must use Markdown single backticks for inline "
            "code; found reStructuredText doubled backticks:",
            file=sys.stderr,
        )
        for location in failures:
            print(f"  {location}", file=sys.stderr)
        print("Run `pnpm format:python` to normalize them.", file=sys.stderr)
        return 1

    action = "checked" if arguments.check else "normalized"
    print(f"Markdown docstrings {action} ({len(paths)} files, {changed} changed).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
