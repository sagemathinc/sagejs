#!/usr/bin/env python3
"""Run the Rust witness emitter on neutral corpus inputs, then verify with PARI."""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

from verify_relations import VerificationError, verify_documents


HERE = Path(__file__).resolve().parent
CRATE = HERE.parents[1]
DEFAULT_CORPUS = CRATE / "corpus"


def _load(path: Path):
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--corpus", action="append", type=Path, help="input JSON; may be repeated"
    )
    parser.add_argument(
        "--binary", type=Path, help="prebuilt pari-class-group-rust binary"
    )
    parser.add_argument("--require-pari-version")
    parser.add_argument(
        "--receipt", type=Path, help="write aggregate JSON here instead of stdout"
    )
    args = parser.parse_args()

    corpus = args.corpus or sorted(DEFAULT_CORPUS.glob("*.json"))
    if args.binary is None:
        subprocess.run(
            [
                "cargo",
                "build",
                "--release",
                "--manifest-path",
                str(CRATE / "Cargo.toml"),
            ],
            check=True,
        )
        binary = (
            CRATE / "target" / "release" / "sagejs-pari-class-group-rust-experiment"
        )
    else:
        binary = args.binary.resolve()

    reports = []
    with tempfile.TemporaryDirectory(prefix="rust-class-group-verify-") as temporary:
        temporary_path = Path(temporary)
        for index, input_path in enumerate(corpus):
            neutral = _load(input_path)
            runtime_input = dict(neutral)
            runtime_input["includeWitnesses"] = True
            runtime_input["samples"] = 1
            generated_input = temporary_path / f"input-{index}.json"
            generated_input.write_text(json.dumps(runtime_input), encoding="utf-8")
            completed = subprocess.run(
                [str(binary), "brute-force-cubic", str(generated_input)],
                check=True,
                capture_output=True,
                text=True,
            )
            rust_result = json.loads(completed.stdout)
            reports.append(
                verify_documents(
                    neutral,
                    rust_result,
                    required_pari_version=args.require_pari_version,
                )
            )

    aggregate = {
        "schema": "sagejs.pari-class-group/rust-relation-corpus-verification-v1",
        "verified": True,
        "fieldsVerified": len(reports),
        "factorBasePrimeIdealsVerified": sum(
            report["factorBasePrimeIdealsVerified"] for report in reports
        ),
        "relationRowsVerified": sum(
            report["relationRowsVerified"] for report in reports
        ),
        "reports": reports,
    }
    rendered = json.dumps(aggregate, indent=2, sort_keys=True) + "\n"
    if args.receipt:
        args.receipt.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except VerificationError as error:
        raise SystemExit(f"verification failed: {error}") from error
