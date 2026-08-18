"""Capture elliptic-curve complex L-values from Sage's PARI backend.

Run this file with one Sage process. It deliberately prepares one PARI
``lfuninit`` object per curve and reuses it for all points and output
precisions, avoiding process and coefficient initialization per value.
"""

import hashlib
import json
import platform
import subprocess
import sys
import time
from pathlib import Path

from sage.all import ComplexField, EllipticCurve, QQ, ZZ, pi
from sage.env import SAGE_ROOT, SAGE_VERSION
from sage.libs.pari.all import pari


def rational(text):
    return QQ(text)


def decimal_string(value):
    if value == 0:
        return "0"
    return value.str(base=10, truncate=False)


def complex_record(value, field):
    value = field(value)
    return {
        "real": decimal_string(value.real()),
        "imag": decimal_string(value.imag()),
    }


def coefficient_probe(curve, cutoff):
    coefficients = curve.anlist(cutoff)
    canonical = ",".join(str(ZZ(a)) for a in coefficients) + "\n"
    return {
        "cutoff": cutoff,
        "length": len(coefficients),
        "canonical_encoding": "utf8 comma-separated base-ten a_0..a_K plus newline",
        "sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    }


def point_value(point, field):
    return field(rational(point["real"]), rational(point["imag"]))


def main():
    if len(sys.argv) != 3:
        raise SystemExit(
            "usage: sage elliptic-lseries.sage CORPUS_SPEC.json OUTPUT.json"
        )

    spec_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    spec_bytes = spec_path.read_bytes()
    spec = json.loads(spec_bytes)
    try:
        displayed_spec_path = str(spec_path.relative_to(Path.cwd().resolve()))
    except ValueError:
        displayed_spec_path = spec_path.name
    try:
        sage_git_revision = subprocess.check_output(
            ["git", "-C", SAGE_ROOT, "rev-parse", "HEAD"], text=True
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        sage_git_revision = None
    points = {point["id"]: point for point in spec["points"]}
    precisions = [int(prec) for prec in spec["precisions_bits"]]
    domain_spec = spec["pari_initialization_domain"]
    domain = [
        rational(domain_spec["center"]),
        rational(domain_spec["width"]),
        rational(domain_spec["height"]),
    ]
    work_bits = max(precisions) + int(
        domain_spec["guard_bits_above_maximum_output_precision"]
    )
    derivative_order = int(domain_spec["derivative_order"])

    started = time.perf_counter()
    records = []
    for curve_spec in spec["curves"]:
        curve_started = time.perf_counter()
        curve = EllipticCurve([rational(a) for a in curve_spec["a_invariants"]])
        conductor = ZZ(curve.conductor())
        root_number = int(curve.root_number())
        if str(conductor) != curve_spec["conductor"]:
            raise RuntimeError(f"conductor mismatch for {curve_spec['id']}")
        if root_number != curve_spec["root_number"]:
            raise RuntimeError(f"root-number mismatch for {curve_spec['id']}")

        wrapper = curve.lseries().dokchitser(
            prec=work_bits,
            max_imaginary_part=rational(domain_spec["height"]),
            algorithm="pari",
        )
        initialized = pari.lfuninit(
            wrapper._L,
            domain,
            derivative_order,
            precision=work_bits,
        )
        profile_points = spec["profiles"][curve_spec["profile"]]
        values = []
        costs = {}
        for precision in precisions:
            costs[str(precision)] = int(
                pari.lfuncost(wrapper._L, domain, precision)[0]
            )
            field = ComplexField(precision)
            for point_id in profile_points:
                point = points[point_id]
                s = point_value(point, field)
                raw = field(pari.lfun(initialized, s, precision=precision))
                completed = field(
                    pari.lfunlambda(initialized, s, precision=precision)
                ) / 2
                values.append(
                    {
                        "point_id": point_id,
                        "precision_bits": precision,
                        "raw": complex_record(raw, field),
                        "completed": complex_record(completed, field),
                    }
                )

        records.append(
            {
                "id": curve_spec["id"],
                "a_invariants": curve_spec["a_invariants"],
                "conductor": str(conductor),
                "root_number": root_number,
                "probable_analytic_rank": curve_spec["probable_analytic_rank"],
                "profile": curve_spec["profile"],
                "isomorphic_to": curve_spec.get("isomorphic_to"),
                "coefficient_probe": coefficient_probe(
                    curve, int(spec["coefficient_probe_cutoff"])
                ),
                "pari_coefficient_cost_by_precision": costs,
                "values": values,
                "capture_seconds": time.perf_counter() - curve_started,
            }
        )
        print(
            f"captured {curve_spec['id']} ({len(values)} values)",
            file=sys.stderr,
            flush=True,
        )

    result = {
        "schema": "sagejs.elliptic-lseries/sage-pari-oracles-v1",
        "description": "Pinned non-rigorous arbitrary-precision complex L-value oracles from Sage/PARI.",
        "semantic_warning": "Values are numerical approximations. Analytic-rank labels, especially ranks 4 and 5, are not proofs of exact vanishing.",
        "normalization": spec["normalization"],
        "source_spec": {
            "path": displayed_spec_path,
            "sha256": hashlib.sha256(spec_bytes).hexdigest(),
        },
        "provenance": {
            "captured_on": time.strftime("%Y-%m-%d", time.gmtime()),
            "sage_version": SAGE_VERSION,
            "sage_git_revision": sage_git_revision,
            "pari_version": str(pari("default(parisize); default(realprecision); version()")),
            "python_version": platform.python_version(),
            "platform": platform.platform(),
            "algorithm": "PARI lfuninit/lfun/lfunlambda through Sage",
            "pari_completed_to_canonical_factor": "1/2",
            "pari_completed_normalization_note": "For elliptic gammaV=[0,1], PARI lfunlambda is twice (sqrt(N)/(2*pi))^s*Gamma(s)*L(E,s). Stored completed values divide PARI's result by two.",
            "single_process": True,
            "working_precision_bits": work_bits,
            "initialization_domain": domain_spec,
            "total_capture_seconds": time.perf_counter() - started,
        },
        "precisions_bits": precisions,
        "points": spec["points"],
        "records": records,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2, sort_keys=False) + "\n")


main()
