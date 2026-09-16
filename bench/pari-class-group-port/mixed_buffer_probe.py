"""Minimal current compiler obstruction; no PARI mathematics involved."""

from sagejs.native import Float64Buffer, Int64Buffer, native


@native
def mixed_buffer_probe(exact: Int64Buffer, approximate: Float64Buffer) -> int:
    if approximate[0] > 0.0:
        return exact[0]
    return 0
