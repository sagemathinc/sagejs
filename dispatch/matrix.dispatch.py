from sagejs.dispatch import (
    Algorithm,
    Capability,
    DispatchFamily,
    Operation,
    Representation,
    all_of,
    any_of,
    available,
    feature,
    not_,
)


DENSE_PRIME_MATRIX = DispatchFamily(
    id="dense-prime-matrix",
    schema=1,
    generation=1,
    features={
        "canonical_output": "boolean",
        "columns": "uint64",
        "inner": "uint64",
        "left_rows": "uint64",
        "modulus": "uint64",
        "right_columns": "uint64",
        "rows": "uint64",
    },
    capabilities=[
        Capability(
            id="fflas-modular-float",
            requires=all_of(
                available("fflas"),
                feature("modulus") < 94906266,
                feature("canonical_output"),
            ),
            reason="FFLAS is unavailable or the modulus exceeds its exact Modular<float> range",
        ),
        Capability(
            id="flint-prime-matrix",
            requires=available("flint-prime-matrix"),
            reason="the generated FLINT prime-matrix boundary is unavailable",
        ),
        Capability(
            id="m4ri-gf2",
            requires=all_of(
                available("m4ri"),
                feature("modulus") == 2,
                feature("canonical_output"),
            ),
            reason="M4RI is unavailable or the field is not GF(2)",
        ),
    ],
    representations=[
        Representation(
            id="m4ri-gf2",
            when=all_of(feature("modulus") == 2, available("m4ri")),
            policy="canonical-when-capable",
            reason="GF(2) has a dedicated packed-bit representation",
        ),
        Representation(
            id="packed-u64",
            when=all_of(
                feature("modulus") < 256,
                any_of(feature("modulus") != 2, not_(available("m4ri"))),
            ),
            policy="canonical",
            reason="small prime matrices canonically own packed row-major residues",
        ),
        Representation(
            id="flint-nmod-resource",
            when=feature("modulus") >= 256,
            policy="canonical-when-capable",
            reason="word-prime matrices canonically use a generated FLINT nmod_mat resource",
        ),
    ],
    operations=[
        Operation(
            id="multiply",
            features=[
                "canonical_output",
                "inner",
                "left_rows",
                "modulus",
                "right_columns",
            ],
            algorithms=[
                Algorithm(
                    id="fflas-float",
                    requires=["fflas-modular-float"],
                    when=feature("modulus") != 2,
                    fallback=["flint", "typed-python"],
                    conversions=["packed-u64-fflas"],
                    reason="FFLAS/FFPACK dense modular multiplication",
                ),
                Algorithm(
                    id="flint",
                    requires=["flint-prime-matrix"],
                    fallback=["typed-python"],
                    reason="generated FLINT exact prime-matrix multiplication",
                ),
                Algorithm(
                    id="m4ri",
                    requires=["m4ri-gf2"],
                    fallback=["flint", "typed-python"],
                    reason="M4RI packed GF(2) multiplication",
                ),
                Algorithm(
                    id="typed-python",
                    when=feature("modulus") < 256,
                    reason="portable typed-Python packed-residue multiplication",
                ),
            ],
        ),
        Operation(
            id="rank",
            features=["canonical_output", "columns", "modulus", "rows"],
            algorithms=[
                Algorithm(
                    id="ffpack",
                    requires=["fflas-modular-float"],
                    when=feature("modulus") != 2,
                    fallback=["flint", "typed-python"],
                    conversions=["packed-u64-fflas"],
                    reason="FFPACK dense modular rank",
                ),
                Algorithm(
                    id="flint",
                    requires=["flint-prime-matrix"],
                    fallback=["typed-python"],
                    reason="generated FLINT exact prime-matrix rank",
                ),
                Algorithm(
                    id="m4ri",
                    requires=["m4ri-gf2"],
                    fallback=["flint", "typed-python"],
                    reason="M4RI packed GF(2) rank",
                ),
                Algorithm(
                    id="typed-python",
                    when=feature("modulus") < 256,
                    reason="portable typed-Python packed-residue rank",
                ),
            ],
        ),
        Operation(
            id="right-nullspace",
            features=["canonical_output", "columns", "modulus", "rows"],
            algorithms=[
                Algorithm(
                    id="ffpack",
                    requires=["fflas-modular-float"],
                    when=feature("modulus") != 2,
                    fallback=["flint", "typed-python"],
                    conversions=["packed-u64-fflas"],
                    reason="FFPACK dense modular right nullspace",
                ),
                Algorithm(
                    id="flint",
                    requires=["flint-prime-matrix"],
                    fallback=["typed-python"],
                    reason="generated FLINT exact prime-matrix right nullspace",
                ),
                Algorithm(
                    id="m4ri",
                    requires=["m4ri-gf2"],
                    fallback=["flint", "typed-python"],
                    reason="M4RI packed GF(2) right nullspace",
                ),
                Algorithm(
                    id="typed-python",
                    when=feature("modulus") < 256,
                    reason="portable typed-Python packed-residue right nullspace",
                ),
            ],
        ),
        Operation(
            id="rref",
            features=["canonical_output", "columns", "modulus", "rows"],
            algorithms=[
                Algorithm(
                    id="ffpack",
                    requires=["fflas-modular-float"],
                    when=feature("modulus") != 2,
                    fallback=["flint", "typed-python"],
                    conversions=["packed-u64-fflas"],
                    reason="FFPACK dense modular reduced row echelon form",
                ),
                Algorithm(
                    id="flint",
                    requires=["flint-prime-matrix"],
                    fallback=["typed-python"],
                    reason="generated FLINT exact prime-matrix reduced row echelon form",
                ),
                Algorithm(
                    id="m4ri",
                    requires=["m4ri-gf2"],
                    fallback=["flint", "typed-python"],
                    reason="M4RI packed GF(2) reduced row echelon form",
                ),
                Algorithm(
                    id="typed-python",
                    when=feature("modulus") < 256,
                    reason="portable typed-Python packed-residue reduced row echelon form",
                ),
            ],
        ),
    ],
)
