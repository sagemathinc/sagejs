#!/usr/bin/env python3
"""Generate Sage.js graph DocSpec data from local and pinned Sage sources.

The generated Python file is part of the Sage.js bootstrap and therefore makes
the reference available in the CLI, Jupyter inspection, SEA binaries, and the
static website.  Only concise API prose is imported; executable examples live
in Sage.js and are independently checked by CI.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


PUBLIC_CLASSES = {
    "GraphAutomorphism",
    "GraphAutomorphismGroup",
    "GraphPlot",
    "GenericGraph",
    "DiGraph",
    "GraphGenerators",
    "DigraphGenerators",
    "GraphQuery",
    "GraphDatabase",
}

DISPLAY_OWNER = {
    "GenericGraph": "Graph",
    "GraphGenerators": "graphs",
    "DigraphGenerators": "digraphs",
}

FALLBACK_SUMMARIES = {
    "GraphAutomorphism.dict": "Return the vertex-image dictionary of this automorphism.",
    "GraphAutomorphismGroup.gens": "Return compact generators of the graph automorphism group.",
    "GraphPlot.plotly": "Return the Plotly figure representing this graph plot.",
    "GraphPlot.plot": "Return this graph plot as a composable graphics object.",
    "GraphPlot.show": "Display this graph plot with the requested options.",
    "GraphQuery.query_iterator": "Iterate lazily over graphs matching this database query.",
    "GraphQuery.get_graphs_list": "Return the graphs matching this database query.",
    "DiGraph.strongly_connected_components": "Return the strongly connected components.",
}


@dataclass(frozen=True)
class UpstreamDoc:
    path: str
    line: int
    owner: str
    name: str
    doc: str


def git_revision(root: Path) -> str:
    return subprocess.check_output(
        ["git", "-C", str(root), "rev-parse", "HEAD"], text=True
    ).strip()


def source_text(node: ast.AST | None) -> str:
    text = ast.unparse(node) if node is not None else ""
    # The implementation distinguishes an omitted edge label from an explicit
    # ``None``. Keep that distinction without leaking the runtime sentinel into
    # a user-facing signature.
    return "..." if text == "runtime.undefined" else text


def signature(function: ast.FunctionDef, public_name: str) -> str:
    positional = [*function.args.posonlyargs, *function.args.args]
    if positional and positional[0].arg == "self":
        positional = positional[1:]
    defaults = [None] * (len(positional) - len(function.args.defaults)) + list(
        function.args.defaults
    )
    pieces: list[str] = []
    positional_only = max(0, len(function.args.posonlyargs) - 1)
    for index, (argument, default) in enumerate(zip(positional, defaults)):
        part = argument.arg
        if argument.annotation is not None:
            part += f": {source_text(argument.annotation)}"
        if default is not None:
            part += f"={source_text(default)}"
        pieces.append(part)
        if positional_only and index + 1 == positional_only:
            pieces.append("/")
    if function.args.vararg is not None:
        part = f"*{function.args.vararg.arg}"
        if function.args.vararg.annotation is not None:
            part += f": {source_text(function.args.vararg.annotation)}"
        pieces.append(part)
    elif function.args.kwonlyargs:
        pieces.append("*")
    for argument, default in zip(
        function.args.kwonlyargs, function.args.kw_defaults
    ):
        part = argument.arg
        if argument.annotation is not None:
            part += f": {source_text(argument.annotation)}"
        if default is not None:
            part += f"={source_text(default)}"
        pieces.append(part)
    if function.args.kwarg is not None:
        part = f"**{function.args.kwarg.arg}"
        if function.args.kwarg.annotation is not None:
            part += f": {source_text(function.args.kwarg.annotation)}"
        pieces.append(part)
    answer = f"{public_name}({', '.join(pieces)})"
    if function.returns is not None:
        answer += f" -> {source_text(function.returns)}"
    return answer


def local_surface(filename: Path) -> list[dict[str, object]]:
    tree = ast.parse(filename.read_text(), filename=str(filename))
    records: list[dict[str, object]] = []
    for statement in tree.body:
        if not isinstance(statement, ast.ClassDef) or statement.name not in PUBLIC_CLASSES:
            continue
        functions = {
            item.name: item
            for item in statement.body
            if isinstance(item, ast.FunctionDef) and not item.name.startswith("_")
        }
        aliases: dict[str, str] = {}
        for item in statement.body:
            if not isinstance(item, ast.Assign) or len(item.targets) != 1:
                continue
            target = item.targets[0]
            if (
                isinstance(target, ast.Name)
                and not target.id.startswith("_")
                and target.id != "toString"
                and isinstance(item.value, ast.Name)
            ):
                aliases[target.id] = item.value.id
        for name, function in functions.items():
            display_owner = DISPLAY_OWNER.get(statement.name, statement.name)
            records.append(
                {
                    "owner": statement.name,
                    "attribute": name,
                    "name": f"{display_owner}.{name}",
                    "signature": signature(function, name),
                    "local_line": function.lineno,
                    "alias_of": None,
                }
            )
        for name, target in aliases.items():
            if target not in functions:
                continue
            display_owner = DISPLAY_OWNER.get(statement.name, statement.name)
            records.append(
                {
                    "owner": statement.name,
                    "attribute": name,
                    "name": f"{display_owner}.{name}",
                    "signature": signature(functions[target], name),
                    "local_line": next(
                        item.lineno
                        for item in statement.body
                        if isinstance(item, ast.Assign)
                        and isinstance(item.targets[0], ast.Name)
                        and item.targets[0].id == name
                    ),
                    "alias_of": f"{display_owner}.{target}",
                }
            )
    return sorted(records, key=lambda item: str(item["name"]))


def upstream_docs(root: Path) -> list[UpstreamDoc]:
    answer: list[UpstreamDoc] = []
    for filename in sorted((root / "src" / "sage" / "graphs").rglob("*.py")):
        try:
            tree = ast.parse(filename.read_text(), filename=str(filename))
        except (SyntaxError, UnicodeDecodeError):
            continue
        relative = str(filename.relative_to(root)).replace("\\", "/")
        for statement in tree.body:
            if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
                doc = ast.get_docstring(statement, clean=True)
                if doc:
                    answer.append(
                        UpstreamDoc(relative, statement.lineno, "", statement.name, doc)
                    )
            elif isinstance(statement, ast.ClassDef):
                for item in statement.body:
                    if not isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        continue
                    doc = ast.get_docstring(item, clean=True)
                    if doc:
                        answer.append(
                            UpstreamDoc(
                                relative,
                                item.lineno,
                                statement.name,
                                item.name,
                                doc,
                            )
                        )
    return answer


def candidate_score(record: dict[str, object], candidate: UpstreamDoc) -> int:
    owner = str(record["owner"])
    path = candidate.path
    score = 0
    if candidate.name != record["attribute"]:
        return -10_000
    if owner == "GenericGraph":
        score += 100 if path.endswith("generic_graph.py") else 0
        score += 40 if candidate.owner == "GenericGraph" else 0
    elif owner == "DiGraph":
        score += 100 if path.endswith("digraph.py") else 0
        score += 40 if candidate.owner == "DiGraph" else 0
        score += 20 if path.endswith("generic_graph.py") else 0
    elif owner == "GraphGenerators":
        score += 100 if "/generators/" in path else 0
    elif owner == "DigraphGenerators":
        score += 100 if path.endswith("digraph_generators.py") else 0
    elif owner in {"GraphDatabase", "GraphQuery"}:
        score += 100 if path.endswith("graph_database.py") else 0
        score += 40 if candidate.owner == owner else 0
    elif owner == "GraphPlot":
        score += 100 if path.endswith("graph_plot.py") else 0
        score += 40 if candidate.owner == "GraphPlot" else 0
    else:
        score += 40 if candidate.owner == owner else 0
    return score


def choose_upstream(
    record: dict[str, object], docs: Iterable[UpstreamDoc]
) -> UpstreamDoc | None:
    candidates = [doc for doc in docs if doc.name == record["attribute"]]
    return max(candidates, key=lambda item: candidate_score(record, item), default=None)


def clean_rst(text: str) -> str:
    text = re.sub(r":\w+(?::\w+)?:`([^`]+)`", r"`\1`", text)
    text = text.replace("``", "`")
    text = re.sub(r"\[([^]]+)\]_", r"[\1]", text)
    text = re.sub(r"`([^`<>]+)\s*<[^>]+>`_", r"`\1`", text)
    return text.strip()


def paragraph(doc: str) -> str:
    return clean_rst(doc.split("\n\n", 1)[0].replace("\n", " "))


def section(doc: str, heading: str) -> str:
    lines = doc.splitlines()
    start = next(
        (index + 1 for index, line in enumerate(lines) if line.strip() == f"{heading}:"),
        None,
    )
    if start is None:
        return ""
    collected: list[str] = []
    for line in lines[start:]:
        stripped = line.strip()
        if re.fullmatch(r"[A-Z][A-Z ]+:", stripped):
            break
        if stripped.startswith("sage:") or stripped.startswith("EXAMPLES"):
            break
        collected.append(line)
    text = clean_rst("\n".join(collected).strip())
    text = re.sub(r"(?m)^\s*-\s+", "- ", text)
    return text


def module_for(record: dict[str, object], upstream: UpstreamDoc | None) -> str:
    if upstream is None:
        return "sage.graphs"
    path = upstream.path.removeprefix("src/").removesuffix(".py")
    return path.replace("/", ".")


def generated_records(
    local: list[dict[str, object]], docs: list[UpstreamDoc], revision: str
) -> list[dict[str, object]]:
    answer: list[dict[str, object]] = []
    for record in local:
        if record["name"] == "graphs.RandomGNP":
            continue
        upstream = choose_upstream(record, docs)
        key = f'{record["owner"]}.{record["attribute"]}'
        summary = (
            paragraph(upstream.doc)
            if upstream is not None
            else FALLBACK_SUMMARIES.get(
                key,
                f'Return the result of the Sage-compatible `{record["attribute"]}` graph operation.',
            )
        )
        parts = [summary]
        parts.extend(
            [
                "### Sage.js status",
                (
                    "This entry is implemented and exercised by the Sage.js graph "
                    "semantic corpus. The executable examples below define the "
                    "currently verified option surface."
                ),
            ]
        )
        provenance: list[dict[str, object]]
        if upstream is not None:
            provenance = [
                {
                    "kind": "sage-derived",
                    "source": f"SageMath `{upstream.path}`:{upstream.line}",
                    "revision": revision,
                    "url": (
                        "https://github.com/sagemath/sage/blob/"
                        f"{revision}/{upstream.path}#L{upstream.line}"
                    ),
                    "license": "GPL-2.0-or-later",
                }
            ]
        else:
            provenance = [
                {
                    "kind": "sagejs-original",
                    "source": "Sage.js graph implementation",
                    "license": "GPL-3.0-only",
                }
            ]
        answer.append(
            {
                **record,
                "module": module_for(record, upstream),
                "doc": "\n\n".join(parts),
                "tags": [
                    "graph theory",
                    (
                        "generators"
                        if record["owner"] in {"GraphGenerators", "DigraphGenerators"}
                        else "graphs"
                    ),
                ],
                "backends": ["Sage.js graph algorithms"],
                "sage_compatibility": {
                    "status": "partial",
                    "notes": (
                        "The documented executable surface is supported; some "
                        "specialized Sage backends and optional keywords are not bundled."
                    ),
                },
                "provenance": provenance,
                "limitations": [
                    "Consult the verified examples for the currently tested option surface."
                ],
                "upstream": (
                    None
                    if upstream is None
                    else {"path": upstream.path, "line": upstream.line}
                ),
            }
        )
    return answer


def write_python(filename: Path, records: list[dict[str, object]]) -> None:
    runtime_records = []
    for record in records:
        runtime_records.append(
            {
                key: value
                for key, value in record.items()
                if key
                not in {
                    "local_line",
                    "alias_of",
                    "upstream",
                }
            }
        )
    # JSON strings never rely on Python's adjacent-literal concatenation,
    # which intentionally is not part of the Sage.js parser subset.  These
    # records contain no JSON null/boolean values, so JSON is also valid Python.
    body = json.dumps(runtime_records, ensure_ascii=False, indent=2)
    filename.write_text(
        "\"\"\"Generated graph documentation data; do not edit manually.\n\n"
        "Regenerate with scripts/import-sage-graph-reference.py.\n"
        "\"\"\"\n\n"
        "from __future__ import annotations\n\n"
        f"_GRAPH_REFERENCE_RECORDS = {body}\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sage-root", type=Path)
    parser.add_argument("--repository-root", type=Path, default=Path.cwd())
    arguments = parser.parse_args()
    repository = arguments.repository_root.resolve()
    sage = (
        arguments.sage_root
        or Path(os.environ.get("SAGE_SOURCE_ROOT", repository.parent / "upstream/sage"))
    ).resolve()
    if not (sage / "src" / "sage" / "graphs").is_dir():
        parser.error(
            f"Sage source not found at {sage}; pass --sage-root or set "
            "SAGE_SOURCE_ROOT"
        )
    revision = git_revision(sage)
    local = local_surface(repository / "src" / "baselib" / "graphs.py")
    records = generated_records(local, upstream_docs(sage), revision)
    output = repository / "src" / "baselib" / "graph_reference_data.py"
    write_python(output, records)
    audit = {
        "schema": "sagejs.graph-reference-import/v1",
        "generatedBy": "scripts/import-sage-graph-reference.py",
        "sage": {
            "repository": "https://github.com/sagemath/sage",
            "revision": revision,
            "license": "GPL-2.0-or-later",
        },
        "sagejsSource": "src/baselib/graphs.py",
        "counts": {
            "publicNames": len(local),
            "generatedEntries": len(records),
            "preexistingEntries": len(local) - len(records),
            "matchedUpstreamDocs": sum(item["upstream"] is not None for item in records),
        },
        "entries": [
            {
                key: value
                for key, value in record.items()
                if key
                in {
                    "name",
                    "owner",
                    "attribute",
                    "signature",
                    "local_line",
                    "alias_of",
                    "upstream",
                }
            }
            for record in records
        ],
    }
    audit_output = (
        repository / "upstream-tests" / "sage" / "graphs" / "api-surface.json"
    )
    audit_output.write_text(json.dumps(audit, indent=2) + "\n")
    print(
        f"Wrote {len(records)} graph DocSpec records ({audit['counts']['matchedUpstreamDocs']} "
        f"matched to Sage {revision[:12]})"
    )


if __name__ == "__main__":
    main()
