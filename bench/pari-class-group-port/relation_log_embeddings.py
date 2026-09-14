"""Resident non-automorphism relation-log prefix for PARI 2.17.4.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Follow get_embs's old-prefix/new-column order using owned generator coordinates.
"""

from sagejs.native import IntegerBuffer, native

from .log_embedding import pari_prepared_log_embedding


@native
def pari_append_relation_log_embeddings(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    generators: IntegerBuffer,
    metadata: IntegerBuffer,
    count: int,
    degree: int,
    real_places: int,
    precision: int,
    completed: IntegerBuffer,
    embeddings: IntegerBuffer,
    coordinates: IntegerBuffer,
    column: IntegerBuffer,
    log_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> int:
    """Append new weighted logarithms without recomputing the saved prefix.

    Metadata uses the collector's one-based generator tokens, relative original
    index and automorphism id. Automorphism records explicitly reject here.
    Rational initial generators have the owned coordinates (p,0,...,0); their
    matrix product equals the upstream scalar column, but this adapter does
    not claim equal operation counts for that representation substitution.

    completed[0] commits one finished column at a time; a later failure leaves
    the old prefix intact and may update constant scratch. This is diagnostic
    resident state, not a public mathematical certificate or serialized token.
    The caller must retain the same matrix, precision and generator prefix;
    upstream precision reinitialization requires discarding this prefix too.
    """
    if (
        degree < 1
        or real_places < 0
        or real_places > degree
        or (degree - real_places) % 2 != 0
    ):
        raise ValueError("invalid relation embedding dimensions")
    if len(completed) < 1 or count < 0 or completed[0] < 0 or completed[0] > count:
        raise ValueError("invalid completed embedding prefix")
    width = 7 * ((degree + real_places) // 2)
    if (
        len(embeddings) < count * width
        or len(column) < width
        or len(coordinates) < degree
    ):
        raise ValueError("short resident embedding workspace")
    if len(generators) < count * degree or len(metadata) < count * 3:
        raise ValueError("short relation generator storage")
    first = completed[0]
    for row in range(first, count):
        if (
            metadata[3 * row] != row + 1
            or metadata[3 * row + 1] != 0
            or metadata[3 * row + 2] != 0
        ):
            raise ValueError("unported relation automorphism or generator mapping")
    for row in range(first, count):
        for i in range(degree):
            coordinates[i] = generators[row * degree + i]
        pari_prepared_log_embedding(
            matrix_m,
            matrix_p,
            matrix_e,
            coordinates,
            degree,
            real_places,
            False,
            precision,
            column,
            log_cache,
            pi_cache,
            a,
            b,
            p,
            q,
            stack,
        )
        for i in range(width):
            embeddings[row * width + i] = column[i]
        completed[0] = row + 1
    return count
