#!/usr/bin/env python3
"""Run one authenticated PARI control sample and emit one JSON line."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
EXECUTABLE = HERE / "build" / "pari-control"
BUILD_IDENTITY = HERE / "build" / "build-identity.json"
PIN = HERE / "pinned-identity.json"
INTEGER = re.compile(r"^-?(?:0|[1-9][0-9]*)$")
BOUNDARIES = {
    "algorithm-stage": "algorithm-stage/pari-bnfinit0-flag-zero-v1",
    "prepared-field": "prepared-field/pari-bnfinit0-flag-zero-v1",
    "public-call": "public-call/pari-nfinit0-plus-bnfinit0-flag-zero-v1",
}


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def resolve_case(path: pathlib.Path, field_id: str | None) -> tuple[str, list[str]]:
    document = json.loads(path.read_text())
    if "polynomialAscending" in document:
        selected = document
        selected_id = field_id or document.get("fieldId") or path.stem
    elif isinstance(document.get("cases"), list):
        if not field_id:
            raise SystemExit("--field-id is required when --input is a corpus manifest")
        matches = [case for case in document["cases"] if case.get("id") == field_id]
        if len(matches) != 1:
            raise SystemExit(
                f"field id {field_id!r} does not identify exactly one case"
            )
        selected = matches[0]
        selected_id = field_id
    else:
        raise SystemExit("input is neither a field input nor a corpus manifest")
    raw = selected.get("polynomialAscending")
    if not isinstance(raw, list) or len(raw) < 3:
        raise SystemExit("polynomialAscending must contain at least three coefficients")
    coefficients = [str(value) for value in raw]
    if any(not INTEGER.fullmatch(value) for value in coefficients):
        raise SystemExit("polynomial coefficients must be canonical decimal integers")
    if int(coefficients[-1]) != 1:
        raise SystemExit(
            "qualification control currently admits monic polynomials only"
        )
    return selected_id, coefficients


def polynomial_expression(coefficients: list[str]) -> str:
    terms = []
    for exponent, coefficient in enumerate(coefficients):
        value = int(coefficient)
        if value == 0:
            continue
        terms.append(f"({value})*x^{exponent}")
    return "+".join(terms) or "0"


def authenticated_build() -> dict:
    if not EXECUTABLE.is_file() or not BUILD_IDENTITY.is_file():
        raise SystemExit("control is not built; run ./build.py first")
    identity = json.loads(BUILD_IDENTITY.read_text())
    if identity.get("sourceSha256") != sha256(HERE / "pari_control.c"):
        raise SystemExit("control source changed after build")
    if identity.get("executableSha256") != sha256(EXECUTABLE):
        raise SystemExit("control executable changed after build")
    if identity.get("authenticatedPin") != json.loads(PIN.read_text()):
        raise SystemExit("pinned PARI identity changed after build")
    pin = identity["authenticatedPin"]
    root = pathlib.Path(pin["root"])
    for relative, expected in pin["files"].items():
        candidate = root / relative
        if not candidate.is_file() or sha256(candidate) != expected:
            raise SystemExit(
                f"authenticated PARI file changed after build: {candidate}"
            )
    return identity


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=pathlib.Path)
    parser.add_argument("--field-id")
    parser.add_argument("--boundary", required=True, choices=sorted(BOUNDARIES))
    parser.add_argument("--seed", default="1")
    arguments = parser.parse_args()
    if not arguments.seed or len(arguments.seed) > 4096:
        raise SystemExit("seed must be nonempty and at most 4096 characters")
    identity = authenticated_build()
    field_id, coefficients = resolve_case(arguments.input.resolve(), arguments.field_id)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", field_id):
        raise SystemExit("field id must be safe canonical identifier text")
    # PARI's scalar seeding API admits an unsigned machine integer, not an
    # arbitrary GEN integer. Keep the high bit clear on every supported host.
    effective_seed = str(
        int.from_bytes(hashlib.sha256(arguments.seed.encode()).digest()[:8], "big")
        & ((1 << 63) - 1)
    )
    completed = subprocess.run(
        [
            str(EXECUTABLE),
            arguments.boundary,
            polynomial_expression(coefficients),
            field_id,
            effective_seed,
        ],
        text=True,
        capture_output=True,
        check=True,
        env={"LANG": "C", "LC_ALL": "C", "PATH": "/usr/bin:/bin"},
    )
    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    if len(lines) != 1:
        raise SystemExit(f"control emitted {len(lines)} nonempty stdout lines")
    sample = json.loads(lines[0])
    if sample.get("boundaryLabel") != BOUNDARIES[arguments.boundary]:
        raise SystemExit("native control returned the wrong boundary label")
    sample["call"]["seed"] = arguments.seed
    sample["call"]["effectivePariSeed"] = effective_seed
    sample["call"]["seedDerivation"] = (
        "low-63-bits-of-unsigned-big-endian-first-64-bits-of-sha256-utf8"
    )
    result = sample.get("result")
    result_json = canonical_json(result)
    sample["exactResultCanonicalJson"] = result_json
    sample["exactResultSha256"] = hashlib.sha256(result_json.encode()).hexdigest()
    sample["input"] = {
        "polynomialAscending": coefficients,
        "inputSha256": sha256(arguments.input.resolve()),
    }
    sample["controlIdentity"] = {
        "pariVersion": identity["authenticatedPin"]["version"],
        "pariArchiveSha256": identity["authenticatedPin"]["archiveSha256"],
        "pariPinSha256": sha256(PIN),
        "gpSha256": identity["authenticatedPin"]["files"]["Olinux-x86_64/gp-dyn"],
        "libpariSha256": identity["authenticatedPin"]["files"][
            "Olinux-x86_64/libpari-gmp-tls.so.9"
        ],
        "buch2Sha256": identity["authenticatedPin"]["files"]["src/basemath/buch2.c"],
        "pariVersionSourceSha256": identity["authenticatedPin"]["files"][
            "config/version"
        ],
        "pariGeneratedConfigSha256": identity["authenticatedPin"]["files"][
            "Olinux-x86_64/paricfg.h"
        ],
        "pariBuildLogSha256": identity["authenticatedPin"]["files"][
            "Olinux-x86_64/config.log"
        ],
        "adapterSourceSha256": identity["sourceSha256"],
        "adapterExecutableSha256": identity["executableSha256"],
        "adapterBuildIdentitySha256": sha256(BUILD_IDENTITY),
        "compilerVersion": identity["compilerVersion"],
    }
    print(canonical_json(sample))


if __name__ == "__main__":
    main()
