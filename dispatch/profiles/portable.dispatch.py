from sagejs.dispatch import DispatchProfile, ProfileOperation, Rule, all_of, feature


PORTABLE = DispatchProfile(
    id="portable",
    schema=1,
    generation=1,
    kind="portable",
    match={},
    declarations={},
    evidence=[
        "dense-prime-fflas-v1",
        "dense-prime-m4ri-v1",
        "dense-prime-portable-v1",
    ],
    operations=[
        ProfileOperation(
            family="dense-prime-matrix",
            operation="multiply",
            rules=[
                Rule(
                    id="gf2-m4ri",
                    choose="m4ri",
                    when=feature("modulus") == 2,
                    evidence="dense-prime-m4ri-v1",
                    reason="prefer the dedicated packed-bit backend for GF(2)",
                ),
                Rule(
                    id="large-fflas",
                    choose="fflas-float",
                    when=all_of(
                        feature("left_rows") >= 32,
                        feature("inner") >= 32,
                        feature("right_columns") >= 32,
                    ),
                    evidence="dense-prime-fflas-v1",
                    reason="FFLAS is a robust win once all multiplication dimensions reach 32",
                ),
                Rule(
                    id="portable-flint",
                    choose="flint",
                    when=True,
                    evidence="dense-prime-portable-v1",
                    reason="use the mature exact backend near the crossover",
                ),
            ],
        ),
        ProfileOperation(
            family="dense-prime-matrix",
            operation="rank",
            rules=[
                Rule(
                    id="gf2-m4ri",
                    choose="m4ri",
                    when=feature("modulus") == 2,
                    evidence="dense-prime-m4ri-v1",
                    reason="prefer the dedicated packed-bit backend for GF(2)",
                ),
                Rule(
                    id="large-ffpack",
                    choose="ffpack",
                    when=all_of(feature("rows") >= 64, feature("columns") >= 64),
                    evidence="dense-prime-fflas-v1",
                    reason="FFPACK rank is a robust win once both dimensions reach 64",
                ),
                Rule(
                    id="portable-flint",
                    choose="flint",
                    when=True,
                    evidence="dense-prime-portable-v1",
                    reason="use the mature exact backend near the crossover",
                ),
            ],
        ),
        ProfileOperation(
            family="dense-prime-matrix",
            operation="right-nullspace",
            rules=[
                Rule(
                    id="gf2-m4ri",
                    choose="m4ri",
                    when=feature("modulus") == 2,
                    evidence="dense-prime-m4ri-v1",
                    reason="prefer the dedicated packed-bit backend for GF(2)",
                ),
                Rule(
                    id="large-ffpack",
                    choose="ffpack",
                    when=all_of(feature("rows") >= 24, feature("columns") >= 24),
                    evidence="dense-prime-fflas-v1",
                    reason="FFPACK nullspace is a robust win once both dimensions reach 24",
                ),
                Rule(
                    id="portable-flint",
                    choose="flint",
                    when=True,
                    evidence="dense-prime-portable-v1",
                    reason="use the mature exact backend near the crossover",
                ),
            ],
        ),
        ProfileOperation(
            family="dense-prime-matrix",
            operation="rref",
            rules=[
                Rule(
                    id="gf2-m4ri",
                    choose="m4ri",
                    when=feature("modulus") == 2,
                    evidence="dense-prime-m4ri-v1",
                    reason="prefer the dedicated packed-bit backend for GF(2)",
                ),
                Rule(
                    id="large-ffpack",
                    choose="ffpack",
                    when=all_of(feature("rows") >= 32, feature("columns") >= 32),
                    evidence="dense-prime-fflas-v1",
                    reason="FFPACK RREF is a robust win once both dimensions reach 32",
                ),
                Rule(
                    id="portable-flint",
                    choose="flint",
                    when=True,
                    evidence="dense-prime-portable-v1",
                    reason="use the mature exact backend near the crossover",
                ),
            ],
        ),
    ],
)
