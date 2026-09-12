/* Release-mode Windows builds must execute the witnesses too. */
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <assert.h>
#include <stdio.h>
#include "sagejs/fq_mpoly_ffi.h"

static uint64_t word(const unsigned char *data)
{
    uint64_t result = 0;
    for (unsigned i = 0; i < 8; i++)
        result |= (uint64_t) data[i] << (8 * i);
    return result;
}

static void foreign_algorithms(uint64_t order, uint64_t characteristic)
{
    uint64_t modulus[] = {1, characteristic == 2 ? 1 : 0, 1};
    uint64_t x_a[] = {1, 0, 0, 1, 1, 0, 0, 0};
    uint64_t y_one[] = {1, 0, 1, 0, 0, 1, 0, 0};
    uint64_t x_y[] = {1, 0, 1, 0, 1, 0, 0, 1};
    uint64_t y_minus_a[] = {1, 0, 0, characteristic - 1, 0, 1, 0, 0};
    sagejs_fq_mpoly_context_t context;
    sagejs_fq_mpoly_t f, g, h, expected, square, cube, g_square, product,
        gcd, resultant, zero, invalid, constant;
    sagejs_fq_mpoly_bytes_t bytes, f_bytes, g_bytes;
    assert(sagejs_fq_mpoly_context_init(context, modulus, 3, characteristic, 2, order));
    assert(sagejs_fq_mpoly_init_packed(f, context, x_a, 8, 2));
    assert(sagejs_fq_mpoly_init_packed(g, context, y_one, 8, 2));
    assert(sagejs_fq_mpoly_init_packed(h, context, x_y, 8, 2));
    assert(sagejs_fq_mpoly_init_packed(expected, context, y_minus_a, 8, 2));
    assert(sagejs_fq_mpoly_init_packed(zero, context, NULL, 0, 0));
    assert(sagejs_fq_mpoly_binary(square, f, f, 2));
    assert(sagejs_fq_mpoly_binary(cube, square, f, 2));
    assert(sagejs_fq_mpoly_binary(g_square, g, g, 2));
    assert(sagejs_fq_mpoly_binary(product, cube, g_square, 2));
    assert(sagejs_fq_mpoly_gcd(gcd, product, square));
    assert(sagejs_fq_mpoly_equal(gcd, square));
    sagejs_fq_mpoly_clear(gcd);
    assert(sagejs_fq_mpoly_gcd(gcd, zero, f));
    assert(sagejs_fq_mpoly_equal(gcd, f));
    sagejs_fq_mpoly_clear(gcd);
    assert(sagejs_fq_mpoly_gcd(gcd, zero, zero));
    assert(sagejs_fq_mpoly_equal(gcd, zero));
    assert(sagejs_fq_mpoly_resultant(resultant, f, h, 0));
    assert(sagejs_fq_mpoly_equal(resultant, expected));
    assert(!sagejs_fq_mpoly_resultant(invalid, f, h, 2));
    sagejs_fq_mpoly_clear(invalid);
    assert(!sagejs_fq_mpoly_factor_bytes(bytes, zero));
    sagejs_flint_byte_region_clear(bytes);
    assert(sagejs_fq_mpoly_term_bytes(f_bytes, f));
    assert(sagejs_fq_mpoly_term_bytes(g_bytes, g));
    /* The factorization owns no borrowed scalar or original parent wrapper. */
    sagejs_fq_mpoly_context_clear(context);
    assert(sagejs_fq_mpoly_factor_bytes(bytes, product));
    assert(memcmp(bytes->data, "SJFF\1\0\0\0", 8) == 0);
    assert(word(bytes->data + 8) == 2);
    size_t offset = 24 + (size_t) word(bytes->data + 16);
    unsigned seen = 0;
    for (unsigned i = 0; i < 2; i++)
    {
        uint64_t multiplicity = word(bytes->data + offset);
        size_t length = (size_t) word(bytes->data + offset + 8);
        const unsigned char *base = bytes->data + offset + 16;
        if (length == f_bytes->length && memcmp(base, f_bytes->data, length) == 0)
        {
            assert(multiplicity == 3);
            seen |= 1;
        }
        else
        {
            assert(length == g_bytes->length && memcmp(base, g_bytes->data, length) == 0);
            assert(multiplicity == 2);
            seen |= 2;
        }
        offset += 16 + length;
    }
    assert(seen == 3 && offset == bytes->length);
    sagejs_flint_byte_region_clear(bytes);
    sagejs_flint_byte_region_clear(f_bytes);
    sagejs_flint_byte_region_clear(g_bytes);
    /* A non-prime-subfield unit survives factorization exactly. */
    assert(sagejs_fq_mpoly_attach(constant, f->context));
    fq_nmod_t a;
    fq_nmod_init(a, f->context->value->fqctx);
    nmod_poly_set_coeff_ui(a, 1, 1);
    fq_nmod_mpoly_set_fq_nmod(constant->value, a, f->context->value);
    fq_nmod_clear(a, f->context->value->fqctx);
    assert(sagejs_fq_mpoly_factor_bytes(bytes, constant));
    assert(word(bytes->data + 8) == 0);
    assert(sagejs_fq_mpoly_term_bytes(f_bytes, constant));
    assert(word(bytes->data + 16) == f_bytes->length);
    assert(memcmp(bytes->data + 24, f_bytes->data, f_bytes->length) == 0);
    sagejs_flint_byte_region_clear(bytes);
    sagejs_flint_byte_region_clear(f_bytes);
    sagejs_fq_mpoly_clear(f);
    sagejs_fq_mpoly_clear(g);
    sagejs_fq_mpoly_clear(h);
    sagejs_fq_mpoly_clear(expected);
    sagejs_fq_mpoly_clear(square);
    sagejs_fq_mpoly_clear(cube);
    sagejs_fq_mpoly_clear(g_square);
    sagejs_fq_mpoly_clear(product);
    sagejs_fq_mpoly_clear(gcd);
    sagejs_fq_mpoly_clear(resultant);
    sagejs_fq_mpoly_clear(zero);
    sagejs_fq_mpoly_clear(constant);
}

int main(void)
{
    /* GF(9), a^2+1: a is deliberately not multiplicatively primitive. */
    uint64_t modulus[] = {1, 0, 1};
    uint64_t coefficients[] = {0, 1, 1, 0, 0, 2};
    uint64_t exponents[] = {1, 0, 0, 1, 1, 0};
    uint64_t packed[] = {0, 1, 1, 0, 0, 2, 1, 0, 0, 1, 1, 0};
    for (uint64_t order = 0; order < 3; order++)
    {
        foreign_algorithms(order, 2);
        foreign_algorithms(order, 3);
        foreign_algorithms(order, UINT64_C(4294967291));
        sagejs_fq_mpoly_context_t context;
        sagejs_fq_mpoly_t value, copy, zero, invalid, sum, product, negative;
        sagejs_flint_byte_region_t bytes;
        assert(sagejs_fq_mpoly_context_init(context, modulus, 3, 3, 2, order));
        assert(!sagejs_fq_mpoly_init_terms(invalid, context,
            coefficients, 5, exponents, 6, 3));
        sagejs_fq_mpoly_clear(invalid);
        uint64_t bad_coefficients[] = {3, 0};
        assert(!sagejs_fq_mpoly_init_terms(invalid, context,
            bad_coefficients, 2, exponents, 2, 1));
        uint64_t bad_exponents[] = {UINT64_MAX, 0};
        assert(!sagejs_fq_mpoly_init_terms(invalid, context,
            coefficients, 2, bad_exponents, 2, 1));
        assert(!sagejs_fq_mpoly_init_terms(invalid, context,
            NULL, 0, NULL, 0, UINT64_MAX));
        assert(sagejs_fq_mpoly_init_terms(value, context,
            coefficients, 6, exponents, 6, 3));
        assert(!sagejs_fq_mpoly_init_packed(invalid, context, packed, 11, 3));
        assert(sagejs_fq_mpoly_init_packed(copy, context, packed, 12, 3));
        assert(sagejs_fq_mpoly_equal(value, copy));
        sagejs_fq_mpoly_clear(copy);
        assert(sagejs_fq_mpoly_init_terms(zero, context, NULL, 0, NULL, 0, 0));
        assert(sagejs_fq_mpoly_copy(copy, value));
        assert(sagejs_fq_mpoly_binary(sum, copy, copy, 0));
        assert(sagejs_fq_mpoly_neg(negative, copy));
        assert(sagejs_fq_mpoly_equal(sum, negative));
        assert(sagejs_fq_mpoly_binary(product, copy, copy, 2));
        assert(sagejs_fq_mpoly_term_bytes(bytes, product));
        assert(word(bytes->data + 96) == 2);
        sagejs_flint_byte_region_clear(bytes);
        sagejs_fq_mpoly_clear(sum);
        sagejs_fq_mpoly_clear(negative);
        sagejs_fq_mpoly_clear(product);
        uint64_t large_powers[] = {SAGEJS_FQ_MPOLY_MAX_EXPONENT, 0};
        assert(sagejs_fq_mpoly_init_terms(product, context,
            coefficients, 2, large_powers, 2, 1));
        assert(!sagejs_fq_mpoly_binary(invalid, product, product, 2));
        sagejs_fq_mpoly_clear(product);
        /* Closing the creating wrapper and one sibling must not invalidate
         * the remaining resources or their canonical transfer. */
        sagejs_fq_mpoly_context_clear(context);
        sagejs_fq_mpoly_clear(value);
        assert(sagejs_fq_mpoly_term_bytes(bytes, copy));
        assert(bytes->length == 104 && memcmp(bytes->data, "SJFM", 4) == 0);
        assert(word(bytes->data + 8) == 3 && word(bytes->data + 16) == 2);
        assert(word(bytes->data + 24) == 2 && word(bytes->data + 32) == order);
        assert(word(bytes->data + 40) == 1);
        assert(word(bytes->data + 48) == 1 && word(bytes->data + 56) == 0);
        assert(word(bytes->data + 64) == 1);
        /* a*x + y + 2*a*x = y in characteristic three. */
        assert(word(bytes->data + 72) == 1 && word(bytes->data + 80) == 0);
        assert(word(bytes->data + 88) == 0 && word(bytes->data + 96) == 1);
        sagejs_flint_byte_region_clear(bytes);
        assert(sagejs_fq_mpoly_term_bytes(bytes, zero) && bytes->length == 72);
        sagejs_flint_byte_region_clear(bytes);
        sagejs_fq_mpoly_clear(copy);
        sagejs_fq_mpoly_clear(zero);
        sagejs_fq_mpoly_clear(zero);
    }
    sagejs_fq_mpoly_context_t invalid;
    uint64_t reducible[] = {2, 0, 1};
    assert(!sagejs_fq_mpoly_context_init(invalid, reducible, 3, 3, 2, 0));
    assert(!sagejs_fq_mpoly_context_init(invalid, modulus, 3, 3, 0, 0));
    assert(!sagejs_fq_mpoly_context_init(invalid, modulus, 3, 3, 65, 0));
    assert(!sagejs_fq_mpoly_context_init(invalid, modulus, 3, 3, 2, 3));
    assert(!sagejs_fq_mpoly_context_init(invalid, modulus, 3, UINT64_MAX, 2, 0));
    sagejs_fq_mpoly_context_clear(invalid);
    /* A characteristic adjacent to the common 32-bit ceiling. Since p=3
     * mod 4, x^2+1 is irreducible, including on the 32-bit Wasm target. */
    sagejs_fq_mpoly_context_t boundary;
    sagejs_fq_mpoly_t constant;
    sagejs_flint_byte_region_t bytes;
    uint64_t boundary_coefficients[] = {UINT64_C(4294967290), 1};
    uint64_t boundary_exponents[] = {0};
    assert(sagejs_fq_mpoly_context_init(boundary, modulus, 3,
        UINT64_C(4294967291), 1, 0));
    assert(sagejs_fq_mpoly_init_terms(constant, boundary,
        boundary_coefficients, 2, boundary_exponents, 1, 1));
    assert(sagejs_fq_mpoly_term_bytes(bytes, constant));
    assert(word(bytes->data + 8) == UINT64_C(4294967291));
    assert(word(bytes->data + 72) == UINT64_C(4294967290));
    sagejs_flint_byte_region_clear(bytes);
    sagejs_fq_mpoly_context_clear(boundary);
    sagejs_fq_mpoly_clear(constant);
    flint_cleanup();
    puts("finite-extension multivariate canonical transfer and lifetime checks passed");
    return 0;
}
