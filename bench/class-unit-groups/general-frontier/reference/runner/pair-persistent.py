"""Join revalidated discovery runs; never promote single samples to qualification."""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "review", Path(__file__).with_name("summarize-persistent.py")
)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def pair(pari, hecke):
    for report, engine in ((pari, "pari"), (hecke, "hecke")):
        if report["engine"] != engine or report["qualification_evidence"] is not False:
            raise ValueError("expected unqualified engine-specific review")
        if report["iterations"] != 1:
            raise ValueError("discovery bands require single-field requests")
        if report["provenance"].get("threads") != 1:
            raise ValueError("unmatched thread policy")
        if type(report.get("seed")) is not int or report["seed"] != 1:
            raise ValueError("unmatched fixed-seed policy")
        hashes = report["provenance"].get("sha256")
        if (
            not isinstance(hashes, dict)
            or not hashes
            or any(
                not isinstance(h, str)
                or len(h) != 64
                or any(c not in "0123456789abcdef" for c in h)
                for h in hashes.values()
            )
        ):
            raise ValueError("missing pinned runtime identities")
    if pari["bits"] != hecke["bits"]:
        raise ValueError("different precision requests")
    indexed = []
    for report in (pari, hecke):
        mapping = {(r["label"], r["sample"]): r for r in report["rows"]}
        if len(mapping) != len(report["rows"]):
            raise ValueError("duplicate samples")
        indexed.append(mapping)
    rows = []
    keys = set(indexed[0]) | set(indexed[1])
    for report in (pari, hecke):
        keys.update((r["label"], r["sample"]) for r in report["missing_samples"])
    for key in sorted(keys):
        a, b = (m.get(key) for m in indexed)
        row = {
            "label": key[0],
            "sample": key[1],
            "status": "censored-or-missing",
            "pari": a,
            "hecke": b,
        }
        if a is not None and b is not None:
            if a["coefficients"] != b["coefficients"]:
                raise ValueError("different defining polynomials")
            if a["status"] == b["status"] == "ok":
                for r in (a, b):
                    c = r["controls"]
                    if (
                        not c
                        or not c.get("hostname")
                        or c.get("affinity") != [2]
                        or c.get("memory_max") != 4294967296
                        or c.get("swap_max") != 0
                        or r["proof_policy"] != "conditional-grh"
                        or r["producer_boundary"]
                        != "persistent-process-fresh-field-not-proven-warm-JIT"
                    ):
                        raise ValueError("missing or unmatched measurement controls")
                if a["controls"]["hostname"] != b["controls"]["hostname"]:
                    raise ValueError("different hosts")
                fields = (
                    "class_number",
                    "class_invariants",
                    "discriminant",
                    "signature",
                    "torsion_order",
                )
                disagreements = [f for f in fields if a[f] != b[f]]
                if disagreements:
                    row.update(
                        status="exact-summary-disagreement", disagreements=disagreements
                    )
                else:
                    ns = min(int(a["worker_nanoseconds"]), int(b["worker_nanoseconds"]))
                    row.update(
                        status="paired-discovery",
                        faster_worker_nanoseconds=str(ns),
                        reference_at_least_one_second=ns >= 10**9,
                        reference_at_least_ten_seconds=ns >= 10**10,
                    )
        rows.append(row)
    return {
        "schema": "sagejs.general-frontier-paired-discovery.v1",
        "pairer_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "qualification_evidence": False,
        "independent_replay": False,
        "regulator_requests_mathematically_equivalent": False,
        "regulator_caveat": "PARI working precision versus Hecke absolute enclosure; retained separately, not proved equal",
        "timing_caveat": "Single-sample discovery, possible residual JIT; no timeout substituted for worker duration",
        "pari_review": pari,
        "hecke_review": hecke,
        "rows": rows,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pari", type=Path)
    parser.add_argument("hecke", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = pair(review.summarize(args.pari), review.summarize(args.hecke))
    with args.output.open("x") as output:
        json.dump(result, output, indent=2, sort_keys=True)
        output.write("\n")
    print(
        json.dumps(
            {
                "rows": len(result["rows"]),
                "paired": sum(
                    r["status"] == "paired-discovery" for r in result["rows"]
                ),
            }
        )
    )
