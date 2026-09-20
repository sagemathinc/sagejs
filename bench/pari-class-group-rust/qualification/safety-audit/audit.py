#!/usr/bin/env python3
"""Reproducible unsafe/FFI/provenance inventory for the Rust class-group trial.

This is deliberately a lexical audit, not a Rust or C soundness proof.  It
fails closed when a safety-sensitive Rust token cannot be classified, and the
promotion mode fails while any unsafe/FFI boundary lacks a nearby explicit
`SAFETY:` or `FFI-SAFETY:` rationale.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tomllib
from pathlib import Path
from typing import Any


SCHEMA = "sagejs.rust-class-group/safety-provenance-audit-v1"
SOURCE_SUFFIXES = {".rs", ".c", ".h", ".cc", ".cpp", ".hpp"}
IGNORED_PARTS = {".git", "target", "node_modules"}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def line_snippet(text: str, line: int) -> str:
    lines = text.splitlines()
    return lines[line - 1].strip()[:240] if 0 < line <= len(lines) else ""


def scope_for(relative: str) -> str:
    if relative == "build.rs":
        return "product-build-support"
    if relative.startswith("src/"):
        return "product-candidate"
    if relative.startswith("tests/"):
        return "product-candidate-test"
    if relative.startswith("qualification/"):
        if relative.endswith("/build.rs"):
            return "qualification-build-support"
        return "qualification-only"
    return "unclassified"


def strip_comments_and_literals(text: str) -> str:
    """Blank comments and literals while preserving offsets and newlines.

    Handles nested Rust block comments and Rust raw strings.  Character
    literals are recognized conservatively; lifetimes are left as code.
    """

    out = list(text)
    index = 0
    block_depth = 0
    length = len(text)
    while index < length:
        if block_depth:
            if text.startswith("/*", index):
                out[index] = out[index + 1] = " "
                block_depth += 1
                index += 2
            elif text.startswith("*/", index):
                out[index] = out[index + 1] = " "
                block_depth -= 1
                index += 2
            else:
                if text[index] != "\n":
                    out[index] = " "
                index += 1
            continue
        if text.startswith("//", index):
            while index < length and text[index] != "\n":
                out[index] = " "
                index += 1
            continue
        if text.startswith("/*", index):
            out[index] = out[index + 1] = " "
            block_depth = 1
            index += 2
            continue
        raw = re.match(r'(?:b)?r(#{0,16})"', text[index:])
        if raw:
            hashes = raw.group(1)
            delimiter = '"' + hashes
            end = text.find(delimiter, index + raw.end())
            end = length if end < 0 else end + len(delimiter)
            for position in range(index, end):
                if text[position] != "\n":
                    out[position] = " "
            index = end
            continue
        prefix_length = 2 if text.startswith('b"', index) else 1
        if text[index] == '"' or text.startswith('b"', index):
            end = index + prefix_length
            escaped = False
            while end < length:
                char = text[end]
                end += 1
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    break
            for position in range(index, end):
                if text[position] != "\n":
                    out[position] = " "
            index = end
            continue
        # A Rust character/byte literal has a closing quote very nearby.  A
        # lifetime such as `'a` does not, so it is intentionally not blanked.
        char_match = re.match(r"(?:b)?'(?:\\.|[^\\'\n])'", text[index:])
        if char_match:
            end = index + char_match.end()
            for position in range(index, end):
                out[position] = " "
            index = end
            continue
        index += 1
    return "".join(out)


def nearby_comment(
    text: str, line: int, offset: int, labels: tuple[str, ...]
) -> dict[str, Any]:
    lines = text.splitlines()
    candidates: list[tuple[int, str]] = []
    line_start = text.rfind("\n", 0, offset) + 1
    prefix = text[line_start:offset]
    if "//" in prefix or "/*" in prefix:
        candidates.append((line, prefix.strip()))
    # Only a directly attached comment contract applies. Attributes may sit
    # between a contract and the item they decorate; unrelated code and blank
    # lines terminate the search.
    index = line - 2
    while index >= 0:
        raw = lines[index]
        stripped = raw.strip()
        if not stripped:
            break
        if (
            stripped.startswith("//")
            or stripped.startswith("/*")
            or stripped.startswith("*")
            or stripped.endswith("*/")
        ):
            candidates.append((index + 1, stripped))
            index -= 1
            continue
        if stripped.startswith("#["):
            index -= 1
            continue
        break
    explicit = [
        item for item in candidates if any(label in item[1].upper() for label in labels)
    ]
    if explicit:
        comment_line, comment_text = explicit[0]
        return {
            "present": True,
            "classification": "explicit-safety-rationale",
            "line": comment_line,
            "text": comment_text[:500],
        }
    if not candidates:
        return {
            "present": False,
            "classification": "missing",
            "line": None,
            "text": None,
        }
    comment_line, comment_text = candidates[0]
    return {
        "present": False,
        "classification": "adjacent-comment-without-explicit-rationale",
        "line": comment_line,
        "text": comment_text[:500],
    }


def finding(
    kind: str,
    relative: str,
    text: str,
    offset: int,
    *,
    name: str | None = None,
    safety_labels: tuple[str, ...] = ("SAFETY:",),
) -> dict[str, Any]:
    line = line_number(text, offset)
    item: dict[str, Any] = {
        "kind": kind,
        "scope": scope_for(relative),
        "file": relative,
        "line": line,
        "column": offset - text.rfind("\n", 0, offset),
        "snippet": line_snippet(text, line),
        "safetyRationale": nearby_comment(text, line, offset, safety_labels),
    }
    if name is not None:
        item["name"] = name
    return item


def matching_brace(masked: str, opening: int) -> int | None:
    depth = 0
    for index in range(opening, len(masked)):
        if masked[index] == "{":
            depth += 1
        elif masked[index] == "}":
            depth -= 1
            if depth == 0:
                return index
    return None


def audit_rust(
    relative: str, text: str
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    masked = strip_comments_and_literals(text)
    unsafe_items: list[dict[str, Any]] = []
    ffi_items: list[dict[str, Any]] = []
    unclassified: list[dict[str, Any]] = []
    unclassified_ffi: list[dict[str, Any]] = []
    classified_offsets: set[int] = set()
    classified_extern_offsets: set[int] = set()

    unsafe_patterns = (
        ("unsafe_attribute", re.compile(r"#\s*\[\s*(unsafe)\s*\(")),
        # String contents are blanked by the lexical masker, so the ABI string
        # appears as whitespace between `extern` and the brace/function.
        ("unsafe_extern_block", re.compile(r"\b(unsafe)\s+extern\s+\{")),
        ("unsafe_function", re.compile(r"\b(unsafe)\s+fn\b")),
        ("unsafe_impl", re.compile(r"\b(unsafe)\s+impl\b")),
        ("unsafe_trait", re.compile(r"\b(unsafe)\s+trait\b")),
        ("unsafe_block", re.compile(r"\b(unsafe)\s*\{")),
    )
    for kind, pattern in unsafe_patterns:
        for match in pattern.finditer(masked):
            offset = match.start(1)
            classified_offsets.add(offset)
            unsafe_items.append(finding(kind, relative, text, offset))
    for match in re.finditer(r"\bunsafe\b", masked):
        if match.start() not in classified_offsets:
            unclassified.append(
                finding("unclassified_unsafe_token", relative, text, match.start())
            )

    extern_pattern = re.compile(r"(?:\bunsafe\s+)?\bextern\s+\{")
    for block in extern_pattern.finditer(masked):
        extern_offset = masked.find("extern", block.start(), block.end())
        classified_extern_offsets.add(extern_offset)
        opening = masked.find("{", block.start(), block.end())
        closing = matching_brace(masked, opening)
        ffi_items.append(
            finding(
                "rust_ffi_import_block",
                relative,
                text,
                block.start(),
                safety_labels=("FFI-SAFETY:", "SAFETY:"),
            )
        )
        if closing is None:
            unclassified.append(
                finding("unterminated_extern_block", relative, text, block.start())
            )
            continue
        block_body = masked[opening + 1 : closing]
        for declaration in re.finditer(
            r"\bfn\s+((?:r#)?[A-Za-z_][A-Za-z0-9_]*)\s*\(", block_body
        ):
            offset = opening + 1 + declaration.start()
            item = finding(
                "rust_ffi_import",
                relative,
                text,
                offset,
                name=declaration.group(1),
                safety_labels=("FFI-SAFETY:", "SAFETY:"),
            )
            link_prefix = text[max(opening + 1, offset - 500) : offset]
            link_names = list(
                re.finditer(r'#\s*\[\s*link_name\s*=\s*"([^"]+)"\s*\]', link_prefix)
            )
            if link_names:
                item["linkedName"] = link_names[-1].group(1)
            ffi_items.append(item)
        for declaration in re.finditer(
            r"\bstatic\s+(?:mut\s+)?((?:r#)?[A-Za-z_][A-Za-z0-9_]*)\s*:",
            block_body,
        ):
            offset = opening + 1 + declaration.start()
            ffi_items.append(
                finding(
                    "rust_ffi_import_static",
                    relative,
                    text,
                    offset,
                    name=declaration.group(1),
                    safety_labels=("FFI-SAFETY:", "SAFETY:"),
                )
            )

    export_pattern = re.compile(
        r"\b(?:pub(?:\([^)]*\))?\s+)?(?:unsafe\s+)?extern\s+fn\s+"
        r"([A-Za-z_][A-Za-z0-9_]*)\s*\("
    )
    for match in export_pattern.finditer(masked):
        extern_offset = masked.find("extern", match.start(), match.end())
        classified_extern_offsets.add(extern_offset)
        ffi_items.append(
            finding(
                "rust_ffi_export",
                relative,
                text,
                match.start(),
                name=match.group(1),
                safety_labels=("FFI-SAFETY:", "SAFETY:"),
            )
        )

    callback_pattern = re.compile(r"\bextern\s+fn\s*\(")
    for match in callback_pattern.finditer(masked):
        classified_extern_offsets.add(match.start())
        ffi_items.append(
            finding(
                "rust_ffi_function_pointer_type",
                relative,
                text,
                match.start(),
                safety_labels=("FFI-SAFETY:", "SAFETY:"),
            )
        )

    # Rust 2024 uses `#[unsafe(no_mangle)]`; older spelling and `export_name`
    # are also ABI exports even when the function itself omits `extern "C"`.
    export_attribute = re.compile(
        r"#\s*\[\s*(?:unsafe\s*\(\s*)?(?:no_mangle|export_name)\b[^\]]*\]"
    )
    for attribute in export_attribute.finditer(masked):
        tail = masked[attribute.end() : attribute.end() + 600]
        function = re.search(
            r"(?:#\s*\[[^\]]*\]\s*)*(?:pub(?:\([^)]*\))?\s+)?"
            r"(?:(?:const|async|unsafe)\s+)*"
            r"(?:(extern)\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(",
            tail,
        )
        if function is None:
            static = re.search(
                r"(?:#\s*\[[^\]]*\]\s*)*(?:pub(?:\([^)]*\))?\s+)?"
                r"static\s+(?:mut\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:",
                tail,
            )
            if static is not None:
                ffi_items.append(
                    finding(
                        "rust_symbol_export_static_attribute",
                        relative,
                        text,
                        attribute.start(),
                        name=static.group(1),
                        safety_labels=("FFI-SAFETY:", "SAFETY:"),
                    )
                )
            else:
                unclassified_ffi.append(
                    finding(
                        "unattached_symbol_export_attribute",
                        relative,
                        text,
                        attribute.start(),
                    )
                )
        elif function.group(1) is None:
            ffi_items.append(
                finding(
                    "rust_symbol_export_attribute",
                    relative,
                    text,
                    attribute.start(),
                    name=function.group(2),
                    safety_labels=("FFI-SAFETY:", "SAFETY:"),
                )
            )

    for match in re.finditer(r"\bextern\b", masked):
        if match.start() not in classified_extern_offsets:
            unclassified_ffi.append(
                finding("unclassified_rust_extern", relative, text, match.start())
            )
    return unsafe_items, ffi_items, unclassified, unclassified_ffi


def matching_parenthesis_backward(masked: str, closing: int) -> int | None:
    depth = 0
    for index in range(closing, -1, -1):
        if masked[index] == ")":
            depth += 1
        elif masked[index] == "(":
            depth -= 1
            if depth == 0:
                return index
    return None


def c_declarator_name(masked: str, start: int, end: int) -> tuple[str, int] | None:
    """Return a lexical function declarator name from ``masked[start:end]``."""

    controls = {"if", "for", "while", "switch", "sizeof"}
    cursor = end - 1
    while cursor >= start and masked[cursor].isspace():
        cursor -= 1
    while cursor >= start:
        noexcept = re.search(r"\bnoexcept\s*$", masked[start : cursor + 1])
        if noexcept:
            cursor = start + noexcept.start() - 1
            while cursor >= start and masked[cursor].isspace():
                cursor -= 1
            continue
        if cursor < start or masked[cursor] != ")":
            return None
        opening = matching_parenthesis_backward(masked, cursor)
        if opening is None or opening < start:
            return None
        before = masked[start:opening]
        name_match = re.search(r"([A-Za-z_][A-Za-z0-9_]*)\s*$", before)
        if name_match and name_match.group(1) in {
            "__attribute__",
            "__declspec",
            "alignas",
            "noexcept",
        }:
            cursor = start + name_match.start(1) - 1
            while cursor >= start and masked[cursor].isspace():
                cursor -= 1
            continue
        if name_match and name_match.group(1) not in controls:
            return name_match.group(1), start + name_match.start(1)
        pointer = re.search(
            r"\(\s*\*\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(", masked[start : cursor + 1]
        )
        if pointer:
            return pointer.group(1), start + pointer.start(1)
        return None
    return None


def c_function_definitions(
    masked: str,
) -> tuple[list[tuple[str, int, str]], list[int]]:
    definitions: list[tuple[str, int, str]] = []
    unclassified: list[int] = []
    for index, char in enumerate(masked):
        if char != "{":
            continue
        segment_start = (
            max(
                masked.rfind("{", 0, index),
                masked.rfind("}", 0, index),
            )
            + 1
        )
        segment = masked[segment_start:index]
        closing = index - 1
        while closing >= segment_start and masked[closing].isspace():
            closing -= 1
        if closing >= segment_start and masked[closing] == ")":
            opening = matching_parenthesis_backward(masked, closing)
            if opening is not None:
                control = re.search(
                    r"([A-Za-z_][A-Za-z0-9_]*)\s*$", masked[segment_start:opening]
                )
                if control and control.group(1) in {"if", "for", "while", "switch"}:
                    continue
        parsed = c_declarator_name(masked, segment_start, index)
        if parsed is not None:
            name, offset = parsed
            definitions.append((name, offset, segment))
        elif segment.rstrip().endswith(")"):
            unclassified.append(segment_start)
    return definitions, unclassified


def audit_c(
    relative: str, text: str, *, header: bool = False
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    masked = strip_comments_and_literals(text)
    items: list[dict[str, Any]] = []
    unclassified: list[dict[str, Any]] = []
    definitions, unclassified_offsets = c_function_definitions(masked)
    for name, offset, signature in definitions:
        if re.search(r"\bstatic\b", signature):
            continue
        kind = "c_program_entry" if name == "main" else "c_ffi_export"
        items.append(
            finding(
                kind,
                relative,
                text,
                offset,
                name=name,
                safety_labels=("FFI-SAFETY:", "SAFETY:"),
            )
        )
    for offset in unclassified_offsets:
        unclassified.append(
            finding("unclassified_c_definition_candidate", relative, text, offset)
        )
    if header:
        segment_start = 0
        for semicolon, char in enumerate(masked):
            if char != ";":
                continue
            start = max(
                segment_start,
                masked.rfind("{", 0, semicolon) + 1,
                masked.rfind("}", 0, semicolon) + 1,
            )
            signature = masked[start:semicolon]
            segment_start = semicolon + 1
            if re.search(r"\b(?:static|typedef)\b", signature):
                continue
            parsed = c_declarator_name(masked, start, semicolon)
            if parsed is None:
                continue
            name, offset = parsed
            items.append(
                finding(
                    "c_header_ffi_declaration",
                    relative,
                    text,
                    offset,
                    name=name,
                    safety_labels=("FFI-SAFETY:", "SAFETY:"),
                )
            )
    for macro in re.finditer(
        r"(?m)^\s*#\s*define\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^\n)]*\)[^\n]*\{",
        masked,
    ):
        unclassified.append(
            finding(
                "c_macro_generated_boundary_candidate", relative, text, macro.start()
            )
        )
    return items, unclassified


def provenance(relative: str, text: str, digest: str) -> dict[str, Any]:
    head = "\n".join(text.splitlines()[:12])
    copyright_lines = [
        line.strip().lstrip("/* ").rstrip(" */")
        for line in text.splitlines()[:12]
        if "Copyright" in line
    ]
    license_match = re.search(r"GPL-[0-9.]+-or-later", head)
    if "The PARI group" in head:
        origin = "pari-derived-attributed"
    elif relative == "qualification/pari-control/pari_control.c":
        origin = "qualification-control-adapter"
    elif re.search(r"PARI\s+2\.17\.4", text):
        origin = "pari-informed-source-map"
    else:
        origin = "sagejs-original-or-unspecified"
    return {
        "file": relative,
        "scope": scope_for(relative),
        "sha256": digest,
        "bytes": len(text.encode()),
        "copyrightNotices": copyright_lines,
        "licenseExpression": license_match.group(0) if license_match else None,
        "originClassification": origin,
        "headerComplete": bool(copyright_lines and license_match),
    }


def dependency_input(root: Path, path: Path) -> dict[str, Any]:
    relative = path.relative_to(root).as_posix()
    data = path.read_bytes()
    document = tomllib.loads(data.decode())
    if relative in {"Cargo.toml", "Cargo.lock"}:
        scope = "product-build-support"
    else:
        scope = "qualification-build-support"
    item: dict[str, Any] = {
        "file": relative,
        "scope": scope,
        "sha256": sha256(data),
        "kind": "cargo-lock" if path.name == "Cargo.lock" else "cargo-manifest",
    }
    if path.name == "Cargo.toml":
        package = document.get("package", {})
        item.update(
            {
                "packageName": package.get("name"),
                "packageVersion": package.get("version"),
                "declaredLicense": package.get("license"),
            }
        )
    else:
        packages = document.get("package", [])
        sources = {"registry": 0, "git": 0, "localOrUnspecified": 0, "other": 0}
        for package in packages:
            source = package.get("source")
            if source is None:
                sources["localOrUnspecified"] += 1
            elif source.startswith("registry+"):
                sources["registry"] += 1
            elif source.startswith("git+"):
                sources["git"] += 1
            else:
                sources["other"] += 1
        item.update({"packageCount": len(packages), "sourceCounts": sources})
    return item


def build_receipt(root: Path) -> dict[str, Any]:
    files: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
            continue
        if any(part in IGNORED_PARTS for part in path.relative_to(root).parts):
            continue
        files.append(path)
    files.sort(key=lambda path: path.relative_to(root).as_posix())
    dependency_paths = sorted(
        (
            path
            for path in root.rglob("Cargo.*")
            if path.is_file()
            and path.name in {"Cargo.toml", "Cargo.lock"}
            and not any(part in IGNORED_PARTS for part in path.relative_to(root).parts)
        ),
        key=lambda path: path.relative_to(root).as_posix(),
    )
    dependency_inputs = [dependency_input(root, path) for path in dependency_paths]

    unsafe_items: list[dict[str, Any]] = []
    ffi_items: list[dict[str, Any]] = []
    unclassified: list[dict[str, Any]] = []
    unclassified_ffi: list[dict[str, Any]] = []
    provenance_items: list[dict[str, Any]] = []
    for path in files:
        relative = path.relative_to(root).as_posix()
        data = path.read_bytes()
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError as error:
            unclassified.append(
                {
                    "kind": "non_utf8_source",
                    "scope": scope_for(relative),
                    "file": relative,
                    "line": 1,
                    "column": 1,
                    "snippet": str(error),
                    "safetyRationale": {
                        "present": False,
                        "classification": "missing",
                        "line": None,
                        "text": None,
                    },
                }
            )
            continue
        provenance_items.append(provenance(relative, text, sha256(data)))
        if path.suffix == ".rs":
            (
                found_unsafe,
                found_ffi,
                found_unclassified,
                found_unclassified_ffi,
            ) = audit_rust(relative, text)
            unsafe_items.extend(found_unsafe)
            ffi_items.extend(found_ffi)
            unclassified.extend(found_unclassified)
            unclassified_ffi.extend(found_unclassified_ffi)
        elif path.suffix in {".c", ".cc", ".cpp"}:
            found_ffi, found_unclassified_ffi = audit_c(relative, text)
            ffi_items.extend(found_ffi)
            unclassified_ffi.extend(found_unclassified_ffi)
        elif path.suffix in {".h", ".hpp"}:
            found_ffi, found_unclassified_ffi = audit_c(relative, text, header=True)
            ffi_items.extend(found_ffi)
            unclassified_ffi.extend(found_unclassified_ffi)

    unsafe_items.sort(
        key=lambda item: (item["file"], item["line"], item["column"], item["kind"])
    )
    ffi_items.sort(
        key=lambda item: (item["file"], item["line"], item["column"], item["kind"])
    )
    unclassified.sort(
        key=lambda item: (item["file"], item["line"], item["column"], item["kind"])
    )
    unclassified_ffi.sort(
        key=lambda item: (item["file"], item["line"], item["column"], item["kind"])
    )
    missing_unsafe = sum(
        not item["safetyRationale"]["present"] for item in unsafe_items
    )
    missing_ffi = sum(not item["safetyRationale"]["present"] for item in ffi_items)
    missing_headers = sum(not item["headerComplete"] for item in provenance_items)
    by_scope: dict[str, dict[str, int]] = {}
    for scope in sorted({item["scope"] for item in provenance_items}):
        scoped_unsafe = [item for item in unsafe_items if item["scope"] == scope]
        scoped_ffi = [item for item in ffi_items if item["scope"] == scope]
        scoped_sources = [item for item in provenance_items if item["scope"] == scope]
        by_scope[scope] = {
            "sourceFiles": len(scoped_sources),
            "unsafeItems": len(scoped_unsafe),
            "unsafeItemsMissingRationale": sum(
                not item["safetyRationale"]["present"] for item in scoped_unsafe
            ),
            "ffiBoundaries": len(scoped_ffi),
            "ffiBoundariesMissingRationale": sum(
                not item["safetyRationale"]["present"] for item in scoped_ffi
            ),
            "sourceFilesMissingProvenanceHeader": sum(
                not item["headerComplete"] for item in scoped_sources
            ),
        }
    unclassified_scopes = sum(
        item["scope"] == "unclassified" for item in provenance_items
    )
    documentation_gate = not (
        missing_unsafe
        or missing_ffi
        or missing_headers
        or unclassified
        or unclassified_ffi
        or unclassified_scopes
    )
    # Header/digest heuristics do not prove source lineage, and lockfile source
    # URLs do not prove dependency license compliance. Those independent gates
    # remain explicitly false rather than being inferred from absence of gaps.
    qualified = False
    receipt: dict[str, Any] = {
        "schema": SCHEMA,
        "auditPolicy": {
            "sourceRoot": "bench/pari-class-group-rust",
            "includedSuffixes": sorted(SOURCE_SUFFIXES),
            "excludedDirectoryNames": sorted(IGNORED_PARTS),
            "safetyRationaleLabels": ["SAFETY:", "FFI-SAFETY:"],
            "rationaleAssociation": "directly-attached-comment-contract-v1",
            "generatedSourcePolicy": {
                "excludedDirectoryNames": sorted(IGNORED_PARTS),
                "audited": False,
                "reason": "ephemeral build outputs are excluded from the reproducible first-party source receipt",
            },
            "promotionRequiresNoGaps": True,
            "limitations": [
                "lexical inventory; not a Rust/C parser or a proof of soundness",
                "does not establish sanitizer, Miri, fuzzing, or production qualification coverage",
                "dependency source is represented by lockfiles elsewhere and is not vendored here",
                "generated/proc-macro/build-output source is excluded and requires an artifact-specific audit",
                "copyright/license headers and PARI keyword heuristics do not prove source lineage",
            ],
        },
        "summary": {
            "sourceFiles": len(provenance_items),
            "unsafeItems": len(unsafe_items),
            "unsafeItemsMissingRationale": missing_unsafe,
            "ffiBoundaries": len(ffi_items),
            "ffiBoundariesMissingRationale": missing_ffi,
            "unclassifiedSafetyTokens": len(unclassified),
            "unclassifiedFfiTokens": len(unclassified_ffi),
            "unclassifiedSourceScopes": unclassified_scopes,
            "sourceFilesMissingProvenanceHeader": missing_headers,
            "byScope": by_scope,
            "documentationGatePassed": documentation_gate,
            "promotionGatePassed": qualified,
        },
        "unsafeItems": unsafe_items,
        "ffiBoundaries": ffi_items,
        "unclassifiedSafetyTokens": unclassified,
        "unclassifiedFfiTokens": unclassified_ffi,
        "sourceProvenance": provenance_items,
        "dependencyInputs": dependency_inputs,
        "claims": {
            "inventoryReproducible": True,
            "generatedSourcesAudited": False,
            "sourceProvenanceEstablished": False,
            "dependencyLicenseCoverageEstablished": False,
            "sanitizerCoverageEstablished": False,
            "miriCoverageEstablished": False,
            "productionQualified": False,
        },
    }
    canonical = json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode()
    receipt["inventorySha256"] = sha256(canonical)
    return receipt


def validate_shape(receipt: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(receipt, dict):
        return ["receipt is not an object"]
    expected = {
        "schema",
        "auditPolicy",
        "summary",
        "unsafeItems",
        "ffiBoundaries",
        "unclassifiedSafetyTokens",
        "unclassifiedFfiTokens",
        "sourceProvenance",
        "dependencyInputs",
        "claims",
        "inventorySha256",
    }
    if set(receipt) != expected:
        errors.append(f"top-level keys differ: {sorted(set(receipt) ^ expected)}")
    if receipt.get("schema") != SCHEMA:
        errors.append("schema identifier differs")
    for key in (
        "unsafeItems",
        "ffiBoundaries",
        "unclassifiedSafetyTokens",
        "unclassifiedFfiTokens",
        "sourceProvenance",
        "dependencyInputs",
    ):
        if not isinstance(receipt.get(key), list):
            errors.append(f"{key} is not an array")
    if not isinstance(receipt.get("summary"), dict):
        errors.append("summary is not an object")
    inventory_hash = receipt.get("inventorySha256")
    if isinstance(inventory_hash, str):
        content = dict(receipt)
        del content["inventorySha256"]
        actual_hash = sha256(
            json.dumps(content, sort_keys=True, separators=(",", ":")).encode()
        )
        if inventory_hash != actual_hash:
            errors.append("inventorySha256 does not authenticate the receipt content")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    default_root = Path(__file__).resolve().parents[2]
    parser.add_argument("--root", type=Path, default=default_root)
    parser.add_argument("--write", type=Path)
    parser.add_argument("--check", type=Path)
    parser.add_argument("--require-qualified", action="store_true")
    args = parser.parse_args()
    receipt = build_receipt(args.root.resolve())
    errors = validate_shape(receipt)
    if args.check:
        expected = json.loads(args.check.read_text())
        errors.extend(validate_shape(expected))
        if expected != receipt:
            errors.append(
                "recorded receipt does not match the current source inventory"
            )
    if args.write:
        args.write.write_text(json.dumps(receipt, indent=2) + "\n")
    if args.require_qualified and not receipt["summary"]["promotionGatePassed"]:
        errors.append(
            "promotion gate is not passed; documentation, provenance, dependency, "
            "or generated-source evidence remains unresolved"
        )
    if errors:
        for error in errors:
            print(f"safety-audit: {error}", file=sys.stderr)
        return 1
    summary = receipt["summary"]
    print(
        "safety-audit: "
        f"{summary['sourceFiles']} sources, {summary['unsafeItems']} unsafe items, "
        f"{summary['ffiBoundaries']} FFI boundaries, "
        f"promotionGatePassed={str(summary['promotionGatePassed']).lower()}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
