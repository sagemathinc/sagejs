"""Warm-profile entry for real number-field local-polygon analysis."""

FIXTURES = (
    (
        "sage-essential-discriminant-cubic",
        (8, -2, 1, 1),
        2,
        2,
        (
            "regular-enlargement",
            1,
            ((2, 0, 0), (0, 2, 0), (0, 1, 1)),
            2,
            True,
            (1, 1),
            (2, 1),
            (((0, 3), (1, 1), (2, 0), (3, 0)),),
        ),
    ),
    (
        "deep-cubic-index-four",
        (3, -1, 5, 1),
        2,
        6,
        (
            "regular-enlargement",
            3,
            ((4, 0, 0), (2, 2, 0), (3, 0, 1)),
            4,
            True,
            (1,),
            (3,),
            (((0, 3), (3, 0)),),
        ),
    ),
    (
        "totally-ramified-seven-cubic",
        (-1, 5, 8, 1),
        7,
        4,
        (
            "regular-enlargement",
            1,
            ((7, 0, 0), (0, 7, 0), (4, 3, 1)),
            7,
            True,
            (1,),
            (3,),
            (((0, 2), (3, 0)),),
        ),
    ),
    (
        "lmfdb-quintic-index-two",
        (2, 1, -1, 2, -1, 1),
        2,
        2,
        (
            "regular-enlargement",
            1,
            (
                (2, 0, 0, 0, 0),
                (0, 2, 0, 0, 0),
                (0, 0, 2, 0, 0),
                (0, 0, 0, 2, 0),
                (0, 1, 0, 0, 1),
            ),
            2,
            True,
            (1, 1, 2),
            (1, 2, 1),
            (((0, 2), (2, 0), (5, 0)),),
        ),
    ),
    (
        "irregular-two-adic-fallback",
        (28, 8, -7, 1),
        2,
        5,
        (
            "fallback-required",
            1,
            ((2, 0, 0), (0, 2, 0), (0, 1, 1)),
            2,
            False,
            (1, 1),
            (2, 1),
            (((0, 2), (2, 0), (3, 0)),),
        ),
    ),
    (
        "irregular-three-adic-second-layer",
        (5, -19, -14, 1),
        3,
        4,
        (
            "fallback-required",
            1,
            ((3, 0, 0), (0, 3, 0), (2, 0, 1)),
            3,
            False,
            (1, 1),
            (2, 1),
            (((0, 2), (2, 0), (3, 0)),),
        ),
    ),
)

DEGREE_32_COEFFICIENTS = (4, 2) + (0,) * 30 + (1,)
DEGREE_32_REPETITIONS = 20
EXPECTED_DEGREE_32 = ("regular-enlargement", 1, 2, True, 32, 63)

_ANALYZE_LOCAL_POLYGONS = None


def __profile_prepare__():
    """Load the production module before sampling begins."""
    global _ANALYZE_LOCAL_POLYGONS
    module = __import__(
        "sagejs.number_fields.local_polygons",
        fromlist=["analyze_local_polygons"],
    )
    _ANALYZE_LOCAL_POLYGONS = module.analyze_local_polygons
    return (len(FIXTURES), len(DEGREE_32_COEFFICIENTS), DEGREE_32_REPETITIONS)


def _fixture_summary(result):
    trace = result.to_trace()
    return (
        result.status,
        result.predicted_index_exponent,
        tuple(tuple(row) for row in result.basis_numerators),
        result.basis_denominator,
        trace["regular"],
        tuple(item["degree"] for item in trace["dedekind"]["modular_factors"]),
        tuple(item["multiplicity"] for item in trace["dedekind"]["modular_factors"]),
        tuple(
            tuple(tuple(point) for point in item["polygon"]["vertices"])
            for item in trace["factor_traces"]
        ),
    )


def _degree_32_summary(result):
    trace = result.to_trace()
    return (
        result.status,
        result.predicted_index_exponent,
        result.basis_denominator,
        trace["regular"],
        len(result.basis_numerators),
        sum(sum(abs(value) for value in row) for row in result.basis_numerators),
    )


def _production_once(degree_32_repetitions=DEGREE_32_REPETITIONS):
    if _ANALYZE_LOCAL_POLYGONS is None:
        raise RuntimeError("call __profile_prepare__ before the production entry")
    fixtures = tuple(
        _ANALYZE_LOCAL_POLYGONS(list(coefficients), prime, valuation)
        for _name, coefficients, prime, valuation, _expected in FIXTURES
    )
    repeated = tuple(
        _ANALYZE_LOCAL_POLYGONS(list(DEGREE_32_COEFFICIENTS), 2)
        for _repeat in range(degree_32_repetitions)
    )
    return (fixtures, repeated)


def _exact_output(payload):
    fixtures, repeated = payload
    observed = tuple(_fixture_summary(result) for result in fixtures)
    expected = tuple(item[4] for item in FIXTURES)
    assert observed == expected
    degree_32 = tuple(_degree_32_summary(result) for result in repeated)
    assert degree_32
    assert all(item == EXPECTED_DEGREE_32 for item in degree_32)
    return (observed, EXPECTED_DEGREE_32, len(degree_32))


def __profile_run__():
    """Run frozen cases and the repeated degree-32 production case."""
    return _exact_output(_production_once())
