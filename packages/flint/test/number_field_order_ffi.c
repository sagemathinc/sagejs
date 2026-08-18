#include <assert.h>
#include <stdint.h>
#include <stdio.h>

static int sagejs_test_fail_independent_prime(long index);
#define SAGEJS_NF_ORDER_INDEPENDENT_TEST_FAIL(index) \
    sagejs_test_fail_independent_prime(index)
#include "sagejs/number_field_order_resource_ffi.h"

static int fail_independent_prime = 0;

static int sagejs_test_fail_independent_prime(long index)
{
    return fail_independent_prime && index == 1;
}

static void set_polynomial(
    sagejs_fmpz_polynomial_t polynomial, slong degree,
    slong linear, slong constant)
{
    assert(sagejs_fmpz_polynomial_init(
        polynomial, (uint64_t) degree + 1));
    fmpz_t value;
    fmpz_init(value);
    fmpz_set_si(value, constant);
    assert(sagejs_fmpz_polynomial_set_coefficient(polynomial, 0, value));
    fmpz_set_si(value, linear);
    assert(sagejs_fmpz_polynomial_set_coefficient(polynomial, 1, value));
    fmpz_one(value);
    assert(sagejs_fmpz_polynomial_set_coefficient(
        polynomial, (uint64_t) degree, value));
    fmpz_clear(value);
    assert(sagejs_fmpz_polynomial_seal(polynomial));
}

static void canonical_basis(
    fmpz_mat_t numerator, fmpz_t denominator,
    const sagejs_fmpq_matrix_t basis)
{
    assert(sagejs_nf_order_normalize_fmpq_basis(
        numerator, denominator, basis));
}

static void assert_generators_contained(
    const fmpz_mat_t merged, const fmpz_t merged_denominator,
    const fmpz_mat_t local, const fmpz_t local_denominator)
{
    const slong degree = fmpz_mat_nrows(merged);
    fmpz_mat_t base_hnf, augmented, augmented_hnf;
    fmpz_mat_init(base_hnf, degree, degree);
    fmpz_mat_hnf(base_hnf, merged);
    fmpz_mat_init(augmented, degree + 1, degree);
    fmpz_mat_init(augmented_hnf, degree + 1, degree);
    for (slong local_row = 0; local_row < degree; local_row++)
    {
        for (slong row = 0; row < degree; row++)
            for (slong column = 0; column < degree; column++)
                fmpz_set(fmpz_mat_entry(augmented, row, column),
                    fmpz_mat_entry(merged, row, column));
        fmpz_t left;
        fmpz_init(left);
        for (slong column = 0; column < degree; column++)
        {
            fmpz_mul(left, fmpz_mat_entry(local, local_row, column),
                merged_denominator);
            assert(fmpz_divisible(left, local_denominator));
            fmpz_divexact(fmpz_mat_entry(
                    augmented, degree, column),
                left, local_denominator);
        }
        fmpz_clear(left);
        fmpz_mat_hnf(augmented_hnf, augmented);
        /* A redundant generator leaves one zero row and the same canonical
         * nonzero row HNF.  Scan exactly as production does so this witnesses
         * FLINT's tall row-HNF convention without assuming zero placement. */
        slong extracted = 0;
        for (slong row = 0; row < degree + 1; row++)
        {
            int nonzero = 0;
            for (slong column = 0; column < degree; column++)
                nonzero |= !fmpz_is_zero(
                    fmpz_mat_entry(augmented_hnf, row, column));
            if (!nonzero) continue;
            assert(extracted < degree);
            for (slong column = 0; column < degree; column++)
                assert(fmpz_equal(
                    fmpz_mat_entry(augmented_hnf, row, column),
                    fmpz_mat_entry(base_hnf, extracted, column)));
            extracted++;
        }
        assert(extracted == degree);
    }
    fmpz_mat_clear(augmented_hnf);
    fmpz_mat_clear(augmented);
    fmpz_mat_clear(base_hnf);
}

static void assert_quadratic_closure(
    const fmpz_mat_t basis, const fmpz_t denominator)
{
    fmpz_mat_t scaled_basis, augmented, expected_hnf, augmented_hnf;
    fmpz_mat_init(scaled_basis, 2, 2);
    fmpz_mat_scalar_mul_fmpz(scaled_basis, basis, denominator);
    fmpz_mat_init(expected_hnf, 2, 2);
    fmpz_mat_hnf(expected_hnf, scaled_basis);
    fmpz_mat_init(augmented, 3, 2);
    fmpz_mat_init(augmented_hnf, 3, 2);
    fmpz_t constant, linear, product;
    fmpz_init(constant);
    fmpz_init(linear);
    fmpz_init(product);
    for (slong left = 0; left < 2; left++)
        for (slong right = 0; right < 2; right++)
        {
            fmpz_mul(constant,
                fmpz_mat_entry(basis, left, 0),
                fmpz_mat_entry(basis, right, 0));
            fmpz_mul(product,
                fmpz_mat_entry(basis, left, 1),
                fmpz_mat_entry(basis, right, 1));
            fmpz_addmul_ui(constant, product, 36);
            fmpz_mul(linear,
                fmpz_mat_entry(basis, left, 0),
                fmpz_mat_entry(basis, right, 1));
            fmpz_addmul(linear,
                fmpz_mat_entry(basis, left, 1),
                fmpz_mat_entry(basis, right, 0));
            fmpz_addmul_ui(linear, product, 6);
            for (slong row = 0; row < 2; row++)
                for (slong column = 0; column < 2; column++)
                    fmpz_set(fmpz_mat_entry(augmented, row, column),
                        fmpz_mat_entry(scaled_basis, row, column));
            fmpz_set(fmpz_mat_entry(augmented, 2, 0), constant);
            fmpz_set(fmpz_mat_entry(augmented, 2, 1), linear);
            fmpz_mat_hnf(augmented_hnf, augmented);
            slong extracted = 0;
            for (slong row = 0; row < 3; row++)
            {
                const int nonzero =
                    !fmpz_is_zero(fmpz_mat_entry(augmented_hnf, row, 0)) ||
                    !fmpz_is_zero(fmpz_mat_entry(augmented_hnf, row, 1));
                if (!nonzero) continue;
                assert(extracted < 2);
                for (slong column = 0; column < 2; column++)
                    assert(fmpz_equal(
                        fmpz_mat_entry(augmented_hnf, row, column),
                        fmpz_mat_entry(expected_hnf, extracted, column)));
                extracted++;
            }
            assert(extracted == 2);
        }
    fmpz_clear(product);
    fmpz_clear(linear);
    fmpz_clear(constant);
    fmpz_mat_clear(augmented_hnf);
    fmpz_mat_clear(augmented);
    fmpz_mat_clear(expected_hnf);
    fmpz_mat_clear(scaled_basis);
}

static void check_exact_coprime_merge(void)
{
    /* alpha = 6*((1+sqrt(5))/2) satisfies x^2 - 6*x - 36.  Its
     * equation order has index 6.  The independently computed 2- and
     * 3-maximal orders have coprime indices and their sum is the full ring. */
    sagejs_fmpz_polynomial_t polynomial;
    set_polynomial(polynomial, 2, -6, -36);
    sagejs_fmpz_matrix_t table;
    assert(sagejs_nf_order_polynomial_multiplication_table(
        table, polynomial));
    const uint64_t two = 2, three = 3, both[] = {2, 3};
    sagejs_fmpq_matrix_t local_two, local_three, sequential;
    assert(sagejs_number_field_order_maximal_at_primes_sequential(
        local_two, table, &two, 1));
    assert(sagejs_number_field_order_maximal_at_primes_sequential(
        local_three, table, &three, 1));
    assert(sagejs_number_field_order_maximal_at_primes_sequential(
        sequential, table, both, 2));
    fmpz_mat_struct local_numerators[2];
    fmpz local_denominators[2];
    for (slong index = 0; index < 2; index++)
    {
        fmpz_mat_init(local_numerators + index, 2, 2);
        fmpz_init(local_denominators + index);
    }
    assert(sagejs_nf_order_unpack_fmpq_basis(
        local_numerators + 0, local_denominators + 0, local_two));
    assert(sagejs_nf_order_unpack_fmpq_basis(
        local_numerators + 1, local_denominators + 1, local_three));
    fmpz_mat_t merged, expected;
    fmpz_mat_init(merged, 2, 2);
    fmpz_mat_init(expected, 2, 2);
    fmpz_t merged_denominator, expected_denominator;
    fmpz_init(merged_denominator);
    fmpz_init(expected_denominator);
    assert(sagejs_nf_order_merge_coprime_bases(
        merged, merged_denominator, local_numerators,
        local_denominators, 2, 2));
    canonical_basis(expected, expected_denominator, sequential);
    assert(fmpz_equal(merged_denominator, expected_denominator));
    assert(fmpz_mat_equal(merged, expected));
    assert(fmpz_equal_ui(merged_denominator, 6));
    fmpz_t determinant;
    fmpz_init(determinant);
    fmpz_mat_det(determinant, merged);
    fmpz_abs(determinant, determinant);
    assert(fmpz_equal_ui(determinant, 6));
    assert_generators_contained(merged, merged_denominator,
        local_numerators + 0, local_denominators + 0);
    assert_generators_contained(merged, merged_denominator,
        local_numerators + 1, local_denominators + 1);
    fmpz_mat_t equation_order;
    fmpz_mat_init(equation_order, 2, 2);
    fmpz_mat_one(equation_order);
    fmpz_t one;
    fmpz_init_set_ui(one, 1);
    assert_generators_contained(merged, merged_denominator,
        equation_order, one);
    assert_quadratic_closure(merged, merged_denominator);
    /* disc(Z[alpha]) = 180 and index 6, hence the merged discriminant is 5. */
    fmpz_t discriminant;
    fmpz_init_set_ui(discriminant, 180);
    fmpz_divexact(discriminant, discriminant, determinant);
    fmpz_divexact(discriminant, discriminant, determinant);
    assert(fmpz_equal_ui(discriminant, 5));

    /* A one-entry corruption is detected by the frozen canonical lattice. */
    fmpz_add_ui(fmpz_mat_entry(local_numerators + 0, 0, 1),
        fmpz_mat_entry(local_numerators + 0, 0, 1), 1);
    assert(sagejs_nf_order_merge_coprime_bases(
        merged, merged_denominator, local_numerators,
        local_denominators, 2, 2));
    assert(!fmpz_equal(merged_denominator, expected_denominator) ||
        !fmpz_mat_equal(merged, expected));

    fmpz_clear(discriminant);
    fmpz_clear(one);
    fmpz_mat_clear(equation_order);
    fmpz_clear(determinant);
    fmpz_clear(expected_denominator);
    fmpz_clear(merged_denominator);
    fmpz_mat_clear(expected);
    fmpz_mat_clear(merged);
    for (slong index = 0; index < 2; index++)
    {
        fmpz_clear(local_denominators + index);
        fmpz_mat_clear(local_numerators + index);
    }
    sagejs_fmpq_matrix_clear(sequential);
    sagejs_fmpq_matrix_clear(local_three);
    sagejs_fmpq_matrix_clear(local_two);
    sagejs_fmpz_matrix_clear(table);
    sagejs_fmpz_polynomial_clear(polynomial);
}

static void check_transactional_worker_failure(void)
{
    sagejs_fmpz_polynomial_t polynomial;
    set_polynomial(polynomial, 65, 1, 1);
    sagejs_fmpz_matrix_t table;
    assert(sagejs_nf_order_polynomial_multiplication_table(
        table, polynomial));
    const uint64_t primes[] = {101, 103};
    sagejs_fmpq_matrix_t unused;
    fail_independent_prime = 1;
    assert(!sagejs_number_field_order_maximal_at_primes(
        unused, table, primes, 2));
    fail_independent_prime = 0;
    sagejs_fmpz_matrix_clear(table);
    sagejs_fmpz_polynomial_clear(polynomial);
}

int main(void)
{
    check_exact_coprime_merge();
    check_transactional_worker_failure();
#if FLINT_USES_PTHREAD
    assert(sagejs_nf_order_independent_worker_bound(90, 18) == 5);
    const char *capability = "pthread-parallel";
#else
    assert(sagejs_nf_order_independent_worker_bound(90, 18) == 1);
    const char *capability = "sequential-correctness-fallback";
#endif
    printf("{\"schema\":\"sagejs.number-field-round2/v1\","
           "\"merge\":\"exact\",\"worker_failure\":\"clean\","
           "\"platform_capability\":\"%s\"}\n", capability);
    flint_cleanup_master();
    return 0;
}
