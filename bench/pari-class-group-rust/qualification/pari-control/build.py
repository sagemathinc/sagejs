#!/usr/bin/env python3
"""Build and authenticate the qualification-only PARI control executable."""

from __future__ import annotations

import hashlib
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
PIN_PATH = HERE / "pinned-identity.json"
SOURCE = HERE / "pari_control.c"
BUILD = HERE / "build"
EXECUTABLE = BUILD / "pari-control"
MANIFEST = BUILD / "build-identity.json"


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_and_verify_pin() -> tuple[dict, pathlib.Path]:
    pin = json.loads(PIN_PATH.read_text())
    root = pathlib.Path(pin["root"])
    failures = []
    for relative, expected in pin["files"].items():
        path = root / relative
        actual = sha256(path) if path.is_file() else None
        if actual != expected:
            failures.append({"path": str(path), "expected": expected, "actual": actual})
    gp_result = subprocess.run(
        [str(root / "gp"), "--version"], text=True, capture_output=True, check=True
    )
    gp = gp_result.stdout + gp_result.stderr
    if "Version 2.17.4 (released)" not in gp:
        failures.append(
            {"path": str(root / "gp"), "expectedVersion": "2.17.4", "actual": gp}
        )
    if failures:
        raise SystemExit(
            "PARI pin authentication failed:\n" + json.dumps(failures, indent=2)
        )
    return pin, root


def main() -> None:
    pin, root = load_and_verify_pin()
    BUILD.mkdir(exist_ok=True)
    command = [
        "cc",
        "-O3",
        "-DNDEBUG",
        "-std=c11",
        "-Wall",
        "-Wextra",
        "-fno-strict-aliasing",
        f"-I{root / 'src/headers'}",
        f"-I{root / 'Olinux-x86_64'}",
        str(SOURCE),
        f"-L{root / 'Olinux-x86_64'}",
        f"-Wl,-rpath,{root / 'Olinux-x86_64'}",
        "-lpari",
        "-lm",
        "-o",
        str(EXECUTABLE),
    ]
    compiler = subprocess.run(
        ["cc", "--version"], text=True, capture_output=True, check=True
    ).stdout
    subprocess.run(command, check=True)
    manifest = {
        "schema": "sagejs.rust-class-group/pari-control-build-identity-v1",
        "authenticatedPin": pin,
        "sourceSha256": sha256(SOURCE),
        "executableSha256": sha256(EXECUTABLE),
        "compilerVersion": compiler.strip(),
        "compilerArguments": command,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, separators=(",", ":")))


if __name__ == "__main__":
    main()
