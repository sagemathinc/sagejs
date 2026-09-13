"""Pinned tiny LMFDB sample used by :mod:`sage.databases.lmfdb`.

The rows are exact projections of public LMFDB records selected to exercise
generalized and even-degree genus-2 models and several number-field signatures.
This sample is intentionally not a complete database.
"""

from __future__ import annotations

BUNDLED_SCHEMA = "sagejs.lmfdb-bundled.v1"
BUNDLED_SOURCE_RELEASE = "lmfdb-public-data-2026-08-27"
BUNDLED_RETRIEVED_AT = "2026-08-27T00:00:00Z"

GENUS2_CURVES = (
    {
        "label": "169.a.169.1",
        "class": "169.a",
        "cond": 169,
        "abs_disc": 169,
        "eqn": "[[0,0,0,0,1,1],[1,1,0,1]]",
        "analytic_rank": 0,
        "analytic_rank_proved": True,
        "mw_rank": 0,
        "mw_rank_proved": True,
        "locally_solvable": True,
        "globally_solvable": 1,
        "torsion_order": 19,
        "torsion_subgroup": "[19]",
    },
    {
        "label": "196.a.21952.1",
        "class": "196.a",
        "cond": 196,
        "abs_disc": 21952,
        "eqn": "[[1,3,6,7,6,3,1],[0,1,1]]",
        "analytic_rank": 0,
        "analytic_rank_proved": True,
        "mw_rank": 0,
        "mw_rank_proved": True,
        "locally_solvable": True,
        "globally_solvable": 1,
    },
    {
        "label": "277.a.277.1",
        "class": "277.a",
        "cond": 277,
        "abs_disc": 277,
        "eqn": "[[0,-1,-1],[1,1,1,1]]",
        "analytic_rank": 0,
        "analytic_rank_proved": True,
        "mw_rank": 0,
        "mw_rank_proved": True,
        "locally_solvable": True,
        "globally_solvable": 1,
        "torsion_order": 15,
        "torsion_subgroup": "[15]",
    },
)

NUMBER_FIELDS = (
    {
        "label": "3.1.23.1",
        "degree": 3,
        "coeffs": ["1", "0", "-1", "1"],
        "r2": 1,
        "disc_sign": -1,
        "disc_abs": "23",
        "index": 1,
        "monogenic": 1,
        "galt": "3T2",
        "class_number": "1",
        "class_group": [],
        "regulator": "0.281199574323",
        "torsion_order": 2,
        "used_grh": False,
    },
    {
        "label": "3.1.283.1",
        "degree": 3,
        "coeffs": ["-1", "4", "0", "1"],
        "r2": 1,
        "disc_sign": -1,
        "disc_abs": "283",
        "index": 1,
        "monogenic": 1,
        "galt": "3T2",
        "class_number": "2",
        "class_group": [2],
        "torsion_order": 2,
        "used_grh": False,
    },
    {
        "label": "3.3.961.1",
        "degree": 3,
        "coeffs": ["8", "-10", "-1", "1"],
        "r2": 0,
        "disc_sign": 1,
        "disc_abs": "961",
        "index": 2,
        "monogenic": -1,
        "galt": "3T1",
        "class_number": "1",
        "class_group": [],
        "torsion_order": 2,
        "used_grh": False,
    },
)

COLLECTIONS = {
    "genus2_curves": GENUS2_CURVES,
    "number_fields": NUMBER_FIELDS,
}

CITATION = (
    "The LMFDB Collaboration, The L-functions and Modular Forms Database, "
    "https://www.lmfdb.org/ (data licensed CC-BY-SA)."
)

COVERAGE = {
    "genus2_curves": {
        "complete": False,
        "description": "tiny stratified Sage.js sample; not a census",
        "record_count": len(GENUS2_CURVES),
    },
    "number_fields": {
        "complete": False,
        "description": "tiny Sage.js correctness sample; not a census",
        "record_count": len(NUMBER_FIELDS),
    },
}
