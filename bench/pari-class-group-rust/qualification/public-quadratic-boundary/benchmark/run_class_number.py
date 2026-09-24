#!/usr/bin/env python3
"""Compare exact scalar class-number calls on the frozen quadratic panel."""

from __future__ import annotations

import hashlib
import json
import pathlib
import platform
import statistics
import subprocess
import sys
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).resolve().parent
CRATE = HERE.parent
PARI_CONTROL = CRATE.parent / "pari-control"
sys.path.insert(0, str(PARI_CONTROL))
from build import load_and_verify_pin  # noqa: E402

PANEL = HERE / "panel.json"
RUST = CRATE / "target" / "release" / "benchmark_public"
PARI = HERE / "build" / "pari-class-number"
SOURCE = HERE / "pari_class_number.c"
RECEIPT = HERE / "class-number-receipt.json"


def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_json(command: list[str]) -> dict:
    result = subprocess.run(command, check=True, text=True, capture_output=True)
    return json.loads(result.stdout)


def build() -> dict:
    pin, pari_root = load_and_verify_pin()
    subprocess.run(
        [
            "cargo",
            "build",
            "--locked",
            "--release",
            "--manifest-path",
            str(CRATE / "Cargo.toml"),
            "--bin",
            "benchmark_public",
        ],
        check=True,
    )
    PARI.parent.mkdir(exist_ok=True)
    subprocess.run(
        [
            "cc",
            "-O3",
            "-DNDEBUG",
            "-std=c11",
            "-Wall",
            "-Wextra",
            "-fno-strict-aliasing",
            f"-I{pari_root / 'src/headers'}",
            f"-I{pari_root / 'Olinux-x86_64'}",
            str(SOURCE),
            f"-L{pari_root / 'Olinux-x86_64'}",
            f"-Wl,-rpath,{pari_root / 'Olinux-x86_64'}",
            "-lpari",
            "-lm",
            "-o",
            str(PARI),
        ],
        check=True,
    )
    return {
        "pariPin": pin,
        "pariControlSourceSha256": digest(SOURCE),
        "pariControlBinarySha256": digest(PARI),
        "rustBinarySha256": digest(RUST),
    }


def main() -> None:
    panel = json.loads(PANEL.read_text())
    identity = build()
    rows = []
    for field in panel["fields"]:
        coefficients = field["polynomialAscending"]
        discriminant = field["expected"]["discriminant"]
        expected = field["expected"]["classNumber"]
        repetitions = 100 if abs(discriminant) < 100000 else 20
        timings: dict[str, list[float]] = {"rust": [], "pari": []}
        for sample_index in range(panel["samplesPerArmPerField"]):
            order = ("rust", "pari") if sample_index % 2 == 0 else ("pari", "rust")
            for arm in order:
                if arm == "rust":
                    sample = run_json(
                        [
                            str(RUST),
                            "--class-number",
                            "--batch",
                            str(repetitions),
                            *map(str, coefficients),
                        ]
                    )
                    answer = sample["result"]["classNumber"]
                else:
                    sample = run_json([str(PARI), str(discriminant), str(repetitions)])
                    answer = sample["classNumber"]
                if answer != expected:
                    raise AssertionError((field["id"], arm, answer, expected))
                timings[arm].append(sample["kernelNanoseconds"] / repetitions)
        rust_median = statistics.median(timings["rust"])
        pari_median = statistics.median(timings["pari"])
        rows.append(
            {
                "fieldId": field["id"],
                "discriminant": discriminant,
                "classNumber": expected,
                "computationsPerSample": repetitions,
                "rustNanosecondsPerCall": timings["rust"],
                "pariNanosecondsPerCall": timings["pari"],
                "rustMedianNanoseconds": rust_median,
                "pariMedianNanoseconds": pari_median,
                "rustToPariMedianRatio": rust_median / pari_median,
            }
        )
        print(
            f"{field['id']}: Rust {rust_median / 1e3:.1f} us, "
            f"PARI {pari_median / 1e3:.1f} us, ratio {rust_median / pari_median:.2f}",
            file=sys.stderr,
        )
    receipt = {
        "schema": "sagejs.public-quadratic/class-number-comparison-v1",
        "promotionStatus": "exploratory-unpromoted",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "panelSha256": digest(PANEL),
        "host": {"system": platform.system(), "machine": platform.machine()},
        "semantics": {
            "rust": "exact primitive reduced-form enumeration of a negative fundamental field discriminant",
            "pari": "PARI 2.17.4 qfbclassno(D,0), documented unconditional for |D|<2*10^10",
            "difference": "Rust starts with monic polynomial coefficients; PARI starts with the equivalent validated discriminant. Internal per-call timing excludes process startup and JSON serialization.",
        },
        "identity": identity,
        "rows": rows,
    }
    RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n")
    print(RECEIPT)


if __name__ == "__main__":
    main()
