#ifndef SAGEJS_MULTIVARIATE_WASM_CORE_H
#define SAGEJS_MULTIVARIATE_WASM_CORE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* "SMPI" and "SMPO", interpreted as little-endian u32 values. */
#define SAGEJS_MPOLY_PACKED_INPUT_MAGIC UINT32_C(0x49504d53)
#define SAGEJS_MPOLY_PACKED_OUTPUT_MAGIC UINT32_C(0x4f504d53)
#define SAGEJS_MPOLY_PACKED_VERSION UINT32_C(1)
#define SAGEJS_MPOLY_PACKED_RESULTANT UINT32_C(1)

#define SAGEJS_MPOLY_MAX_INPUT_BYTES (UINT32_C(1) * 1024 * 1024)
#define SAGEJS_MPOLY_MAX_OUTPUT_BYTES (UINT32_C(16) * 1024 * 1024)
#define SAGEJS_MPOLY_MAX_TERMS UINT32_C(256)
#define SAGEJS_MPOLY_MAX_COEFFICIENT_WORDS UINT32_C(16)
#define SAGEJS_MPOLY_MAX_ELIMINATION_DEGREE UINT32_C(8)
#define SAGEJS_MPOLY_MAX_PARAMETER_DEGREE UINT32_C(8)

enum sagejs_mpoly_packed_status {
    SAGEJS_MPOLY_PACKED_OK = 0,
    SAGEJS_MPOLY_PACKED_MALFORMED = 1,
    SAGEJS_MPOLY_PACKED_UNSUPPORTED = 2,
    SAGEJS_MPOLY_PACKED_FLINT_FAILURE = 3,
    SAGEJS_MPOLY_PACKED_OUTPUT_TOO_SMALL = 4,
    SAGEJS_MPOLY_PACKED_RESULT_LIMIT = 5
};

enum sagejs_mpoly_packed_ordering {
    SAGEJS_MPOLY_PACKED_LEX = 0,
    SAGEJS_MPOLY_PACKED_DEGLEX = 1,
    SAGEJS_MPOLY_PACKED_DEGREVLEX = 2
};

/*
 * Execute one exact FLINT resultant from a copied packed request.
 *
 * All integers in the packet are little-endian u32 values. The 32-byte input
 * header is magic, version, operation, variable count, ordering, eliminated
 * variable, left term count, and right term count. Each term is encoded as a
 * sign (1 positive, 2 negative), a nonzero coefficient-word count, that many
 * least-significant-first magnitude words, then one exponent per variable.
 * Zero polynomials have no terms; encoded zero coefficients are rejected.
 *
 * The 24-byte output header is magic, version, operation, variable count,
 * ordering, and term count, followed by terms in the same representation and
 * FLINT's canonical monomial order. `output_length` receives the complete
 * required byte count for success and OUTPUT_TOO_SMALL. Caller memory remains
 * caller-owned and no pointer is retained after this synchronous call.
 */
int sagejs_fmpz_mpoly_resultant_packed(
    const uint8_t *input,
    size_t input_length,
    uint8_t *output,
    size_t output_capacity,
    size_t *output_length);

#ifdef __cplusplus
}
#endif

#endif
