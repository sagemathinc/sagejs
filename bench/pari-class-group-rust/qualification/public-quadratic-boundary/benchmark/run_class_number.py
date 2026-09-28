#!/usr/bin/env python3
"""Compare exact scalar class-number calls on the frozen quadratic panel."""

from __future__ import annotations

import argparse
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
REPOSITORY = CRATE.parents[3]
FLINT_PACKAGE = REPOSITORY / "packages" / "flint"
FLINT_SAMPLE = HERE / "flint_class_number.cjs"
PARI_CONTROL = CRATE.parent / "pari-control"
sys.path.insert(0, str(PARI_CONTROL))
from build import load_and_verify_pin  # noqa: E402

PANEL = HERE / "panel.json"
RUST = CRATE / "target" / "release" / "benchmark_public"
PARI = HERE / "build" / "pari-class-number"
PARI_PUBLIC_CONTROL = PARI_CONTROL / "build" / "pari-control"
SOURCE = HERE / "pari_class_number.c"
RECEIPT = HERE / "class-number-receipt.json"


def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_json(command: list[str]) -> dict:
    result = subprocess.run(command, check=True, text=True, capture_output=True)
    return json.loads(result.stdout)


def build() -> dict:
    pin, pari_root = load_and_verify_pin()
    public_build = subprocess.run(
        [sys.executable, str(PARI_CONTROL / "build.py")],
        check=True,
        text=True,
        capture_output=True,
    )
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
        "pariPublicControlBuild": json.loads(public_build.stdout),
        "pariControlSourceSha256": digest(SOURCE),
        "pariControlBinarySha256": digest(PARI),
        "rustBinarySha256": digest(RUST),
        "flintAddonSha256": digest(
            FLINT_PACKAGE / "build" / "Release" / "sagejs_flint.node"
        ),
        "flintAddonManifestSha256": digest(
            FLINT_PACKAGE / "build" / "Release" / "sagejs_flint.manifest.json"
        ),
        "flintAddonManifest": json.loads(
            (
                FLINT_PACKAGE / "build" / "Release" / "sagejs_flint.manifest.json"
            ).read_text()
        ),
        "flintControlSourceSha256": digest(FLINT_SAMPLE),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--panel", default=PANEL.name)
    parser.add_argument("--receipt", default=RECEIPT.name)
    arguments = parser.parse_args()
    panel_path = (HERE / arguments.panel).resolve()
    receipt_path = (HERE / arguments.receipt).resolve()
    if panel_path.parent != HERE or receipt_path.parent != HERE:
        parser.error("panel and receipt must be files in the benchmark directory")
    panel = json.loads(panel_path.read_text())
    assert panel["frozenBeforeTiming"] is True
    assert panel["samplesPerArmPerField"] >= 15
    identity = build()
    if any(
        abs(field["expected"]["discriminant"]) >= 20_000_000_000
        for field in panel["fields"]
    ):
        if not PARI_PUBLIC_CONTROL.is_file():
            raise SystemExit(
                "authenticated PARI public control is missing; run ../pari-control/build.py"
            )
        identity["pariPublicControlBinarySha256"] = digest(PARI_PUBLIC_CONTROL)
    rows = []
    for field in panel["fields"]:
        coefficients = field["polynomialAscending"]
        discriminant = field["expected"]["discriminant"]
        expected = field["expected"]["classNumber"]
        repetitions = 100 if abs(discriminant) < 100000 else 20
        pari_method = (
            "qfbclassno(D,0)"
            if abs(discriminant) < 20_000_000_000
            else "nfinit0+bnfinit0(flag=0; GRH-conditional)"
        )
        timings: dict[str, list[float]] = {"rust": [], "pari": [], "flint": []}
        for sample_index in range(panel["samplesPerArmPerField"]):
            arms = ("rust", "pari", "flint")
            order = arms[sample_index % 3 :] + arms[: sample_index % 3]
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
                elif arm == "pari":
                    if pari_method == "qfbclassno(D,0)":
                        sample = run_json(
                            [str(PARI), str(discriminant), str(repetitions)]
                        )
                        assert (
                            sample["boundaryLabel"]
                            == "pari-2.17.4-qfbclassno0-flag-zero-v1"
                        )
                        assert sample["discriminant"] == discriminant
                        answer = sample["classNumber"]
                        elapsed_per_call = sample["kernelNanoseconds"] / repetitions
                    else:
                        sample = run_json(
                            [
                                str(PARI_PUBLIC_CONTROL),
                                "public-call",
                                field["pariPolynomial"],
                                field["id"],
                                str(2_026_092_500 + sample_index),
                            ]
                        )
                        assert sample["boundaryKind"] == "public-call"
                        assert sample["boundaryLabel"] == panel["boundary"]["pari"]
                        assert sample["call"]["pariVersion"] == ["2", "17", "4"]
                        assert sample["detail"]["discriminant"] == str(discriminant)
                        assert sample["call"]["noPariInProductPath"] is True
                        assert sample["result"]["invariantFactors"] == [
                            str(value)
                            for value in field["expected"]["invariantFactors"]
                        ]
                        answer = int(sample["result"]["classNumber"])
                        elapsed_per_call = int(sample["kernelNanoseconds"])
                else:
                    sample = run_json(
                        [
                            "node",
                            str(FLINT_SAMPLE),
                            str(FLINT_PACKAGE),
                            str(discriminant),
                            str(repetitions),
                        ]
                    )
                    answer = sample["classNumber"]
                if answer != expected:
                    raise AssertionError((field["id"], arm, answer, expected))
                timings[arm].append(
                    elapsed_per_call
                    if arm == "pari"
                    else sample["kernelNanoseconds"] / repetitions
                )
        rust_median = statistics.median(timings["rust"])
        pari_median = statistics.median(timings["pari"])
        flint_median = statistics.median(timings["flint"])
        rows.append(
            {
                "fieldId": field["id"],
                "discriminant": discriminant,
                "classNumber": expected,
                "rustFlintComputationsPerSample": repetitions,
                "pariComputationsPerSample": repetitions
                if pari_method == "qfbclassno(D,0)"
                else 1,
                "pariMethod": pari_method,
                "rustNanosecondsPerCall": timings["rust"],
                "pariNanosecondsPerCall": timings["pari"],
                "flintNanosecondsPerCall": timings["flint"],
                "rustMedianNanoseconds": rust_median,
                "pariMedianNanoseconds": pari_median,
                "flintMedianNanoseconds": flint_median,
                "rustToPariMedianRatio": rust_median / pari_median,
                "flintToPariMedianRatio": flint_median / pari_median,
            }
        )
        print(
            f"{field['id']}: Rust {rust_median / 1e3:.1f} us, "
            f"FLINT {flint_median / 1e3:.1f} us, PARI {pari_median / 1e3:.1f} us, "
            f"Rust/PARI {rust_median / pari_median:.2f}, FLINT/PARI {flint_median / pari_median:.2f}",
            file=sys.stderr,
        )
    receipt = {
        "schema": "sagejs.public-quadratic/class-number-comparison-v3",
        "promotionStatus": "exploratory-unpromoted",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "panelSha256": digest(panel_path),
        "host": {
            "system": platform.system(),
            "machine": platform.machine(),
            "processor": platform.processor(),
            "nodeVersion": subprocess.check_output(
                ["node", "--version"], text=True
            ).strip(),
            "rustcVersion": subprocess.check_output(
                ["rustc", "--version"], text=True
            ).strip(),
        },
        "semantics": {
            "rust": "exact primitive reduced-form enumeration of a negative fundamental field discriminant",
            "pari": "PARI 2.17.4 qfbclassno(D,0), documented unconditional when |D|<2*10^10; above that bound, the public nfinit0+bnfinit0(flag=0) class-number projection, which also computes the full group but is GRH-conditional without bnfcertify",
            "flint": "current source-matched Sage.js FLINT N-API qfbClassNumber(D), exact reduced-form enumeration",
            "difference": "Rust starts with monic polynomial coefficients; PARI and FLINT start with the equivalent validated discriminant. Internal per-call timing excludes process startup and JSON serialization.",
        },
        "identity": identity,
        "rows": rows,
    }
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    print(receipt_path)


if __name__ == "__main__":
    main()
