"""Prepare the predeclared two-per-cell supplemental cost screen."""

import argparse
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "supplement", Path(__file__).resolve().parents[2] / "corpus/rank_two_supplement.py"
)
supplement = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supplement)


def prepare():
    export = supplement.generate()
    records = [record for record in export["records"] if record["parameter_index"] < 2]
    return [
        {"label": r["label"], "coefficients": r["coefficients"]} for r in records
    ], {
        "schema": "sagejs.rank-two-supplement-initial-screen.v1",
        "supplement_export_sha256": export["export_sha256"],
        "parameter_indices": [0, 1],
        "scales": list(supplement.SCALES),
        "family_order": list(supplement.FAMILIES),
        "candidate_count": len(records),
        "request_cap_seconds": 60,
        "worst_case_request_wall_seconds": 60 * len(records),
        "qualification_evidence": False,
        "selection_uses_sagejs_results": False,
        "fields": [
            {
                key: r[key]
                for key in ("label", "family", "decimal_scale", "parameter_index")
            }
            for r in records
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    records, policy = prepare()
    for path, data in (
        (args.output, records),
        (Path(str(args.output) + ".selection.json"), policy),
    ):
        with path.open("x") as out:
            json.dump(data, out, indent=2, sort_keys=True)
            out.write("\n")
    print(json.dumps({"candidates": len(records), "request_cap_seconds": 60}))
