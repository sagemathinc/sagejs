"""Exercise actual proof support across growing and shrinking resident prefixes."""

from sagejs.ffi.flint import (
    FmpzMatrix,
    fmpz_matrix,
    fmpz_matrix_hnf_into,
    fmpz_matrix_hnf_prefix_into,
)
from sagejs.native import IntegerBuffer, NativeExactArena, native, uint64
from sagejs.number_fields.cubic_class_number_native import (
    _cubic_online_relation_lattice_update,
    _cubic_prepare_proof_relation_support,
)


@native
def proof_support_schedule(
    rows: IntegerBuffer,
    observations: IntegerBuffer,
    diagnostics: IntegerBuffer,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> bool:
    """Use real exact HNF and the production helper; no arithmetic doubles."""
    if len(rows) != 24 or len(observations) != 120 or len(diagnostics) != 64:
        return False
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        relations = arena.foreign_resource(fmpz_matrix, 8, 3)
        hermite = arena.foreign_resource(fmpz_matrix, 8, 3)
        online_basis = arena.foreign_resource(fmpz_matrix, 3, 3)
        online_source = arena.foreign_resource(fmpz_matrix, 4, 3)
        online_hnf = arena.foreign_resource(fmpz_matrix, 4, 3)
        online_support = arena.foreign_resource(fmpz_matrix, 8, 1)
        online_coordinates = arena.foreign_resource(fmpz_matrix, 1, 3)
        proof_support = arena.foreign_resource(fmpz_matrix, 9, 1)
        proof_basis = arena.foreign_resource(fmpz_matrix, 3, 3)
        proof_source = arena.foreign_resource(fmpz_matrix, 4, 3)
        proof_hnf = arena.foreign_resource(fmpz_matrix, 4, 3)
        proof_coordinates = arena.foreign_resource(fmpz_matrix, 1, 3)
        saved_support = arena.integer_vector(8, 0)
        row: uint64 = 0
        while row < 8:
            column: uint64 = 0
            while column < 3:
                relations[row, column] = rows[3 * row + column]
                column += 1
            status = _cubic_online_relation_lattice_update(
                online_basis,
                online_source,
                online_hnf,
                online_support,
                online_coordinates,
                relations,
                row,
                3,
            )
            if status < 0:
                return False
            saved_support[row] = online_support[row, 0]
            row += 1
        stage: uint64 = 0
        while stage < 4:
            prefix: uint64 = 5
            if stage == 1 or stage == 3:
                prefix = 8
            if not fmpz_matrix_hnf_prefix_into(hermite, relations, prefix, 3):
                return False
            mode: uint64 = 0
            while mode < 3:
                row = 0
                while row < 9:
                    proof_support[row, 0] = -911
                    row += 1
                row = 0
                while row < 3:
                    column = 0
                    while column < 3:
                        proof_basis[row, column] = 73
                        column += 1
                    row += 1
                count, ready = _cubic_prepare_proof_relation_support(
                    relations,
                    hermite,
                    online_support,
                    proof_support,
                    proof_coordinates,
                    proof_basis,
                    proof_source,
                    proof_hnf,
                    diagnostics,
                    prefix,
                    3,
                    3,
                    mode == 2,
                    mode == 1,
                )
                if not ready:
                    return False
                offset: uint64 = 10 * (3 * stage + mode)
                observations[offset] = count
                observations[offset + 1] = prefix
                row = 0
                while row < 8:
                    if online_support[row, 0] != saved_support[row]:
                        return False
                    column = 0
                    while column < 3:
                        if relations[row, column] != rows[3 * row + column]:
                            return False
                        column += 1
                    observations[offset + 2 + row] = proof_support[row, 0]
                    if row >= prefix and proof_support[row, 0] != -911:
                        return False
                    row += 1
                if proof_support[8, 0] != -911:
                    return False
                mode += 1
            # An inconsistent established HNF is fatal, not insufficient
            # evidence. Its failed attempt must not poison a subsequent one.
            saved_pivot = hermite[0, 0]
            hermite[0, 0] = saved_pivot + 1
            count, ready = _cubic_prepare_proof_relation_support(
                relations,
                hermite,
                online_support,
                proof_support,
                proof_coordinates,
                proof_basis,
                proof_source,
                proof_hnf,
                diagnostics,
                prefix,
                3,
                3,
                False,
                False,
            )
            if ready or diagnostics[59] != 422:
                return False
            hermite[0, 0] = saved_pivot
            count, ready = _cubic_prepare_proof_relation_support(
                relations,
                hermite,
                online_support,
                proof_support,
                proof_coordinates,
                proof_basis,
                proof_source,
                proof_hnf,
                diagnostics,
                prefix,
                3,
                3,
                False,
                False,
            )
            if not ready:
                return False
            stage += 1
        return True
