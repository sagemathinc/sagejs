#include <stdint.h>
#include <stdio.h>

#include <sagejs/hyperelliptic/rforest.h>

static int fail(const char *message)
{
    fprintf(stderr, "rforest bridge test failed: %s\n", message);
    return 1;
}

static const sagejs_rforest_row *find_row(
    const sagejs_rforest_batch *batch, uint64_t prime)
{
    for (size_t index = 0; index < batch->row_count; index += 1)
        if (batch->rows[index].prime == prime)
            return &batch->rows[index];
    return NULL;
}

static int check_row(
    const sagejs_rforest_batch *batch,
    uint64_t prime,
    const uint64_t *expected,
    uint8_t genus)
{
    const sagejs_rforest_row *row = find_row(batch, prime);
    if (row == NULL || !row->good || row->coefficient_count != genus)
        return 0;
    for (uint8_t index = 0; index < genus; index += 1)
        if (row->coefficients[index] != expected[index])
            return 0;
    return 1;
}

int main(void)
{
    static const int64_t genus2[] = {1, 1, 0, 0, 0, 1};
    static const int64_t genus2_exact_root[] = {0, -1, 0, 0, 0, 1};
    static const int64_t genus3[] = {1, 1, 0, 0, 0, 0, 0, 1};
    static const struct {
        uint64_t prime;
        uint64_t residues[3];
    } genus3_expected[] = {
        {5, {3, 4, 2}},
        {17, {3, 12, 10}},
        {97, {91, 39, 7}},
        {101, {19, 12, 60}}
    };
    sagejs_rforest_batch batch;

    if (!sagejs_rforest_available())
        return fail("backend unavailable");
    if (sagejs_rforest_hasse_witt_batch_compute(
            genus2, sizeof(genus2) / sizeof(genus2[0]), 2,
            2, 29, 0, &batch) != SAGEJS_RFOREST_STATUS_OK)
        return fail("genus-2 batch status");
    {
        static const uint64_t expected5[] = {0, 0};
        static const uint64_t expected11[] = {7, 3};
        static const uint64_t expected19[] = {15, 14};
        static const uint64_t expected29[] = {5, 11};
        if (!check_row(&batch, 5, expected5, 2) ||
            !check_row(&batch, 11, expected11, 2) ||
            !check_row(&batch, 19, expected19, 2) ||
            !check_row(&batch, 29, expected29, 2))
            return fail("genus-2 residues");
    }
    if (find_row(&batch, 2)->status !=
        SAGEJS_RFOREST_ROW_UNSUPPORTED_CHARACTERISTIC)
        return fail("characteristic-two status");
    sagejs_rforest_batch_clear(&batch);

    if (sagejs_rforest_hasse_witt_batch_compute(
            genus2_exact_root,
            sizeof(genus2_exact_root) / sizeof(genus2_exact_root[0]), 2,
            17, 17, 0, &batch) != SAGEJS_RFOREST_STATUS_OK)
        return fail("exact-root batch status");
    {
        static const uint64_t expected[] = {12, 2};
        if (!check_row(&batch, 17, expected, 2) ||
            batch.rows[0].status != SAGEJS_RFOREST_ROW_FOREST)
            return fail("exact-root factorial forest");
    }
    sagejs_rforest_batch_clear(&batch);

    if (sagejs_rforest_hasse_witt_batch_compute(
            genus3, sizeof(genus3) / sizeof(genus3[0]), 3,
            2, 101, 0, &batch) != SAGEJS_RFOREST_STATUS_OK)
        return fail("genus-3 batch status");
    for (size_t index = 0;
         index < sizeof(genus3_expected) / sizeof(genus3_expected[0]);
         index += 1)
        if (!check_row(
            &batch, genus3_expected[index].prime,
            genus3_expected[index].residues, 3))
            return fail("genus-3 oracle residues");
    if (find_row(&batch, 3)->status != SAGEJS_RFOREST_ROW_DIRECT)
        return fail("translated-constant direct fallback");
    sagejs_rforest_batch_clear(&batch);

    if (sagejs_rforest_hasse_witt_batch_compute(
            genus3, sizeof(genus3) / sizeof(genus3[0]), 3,
            2, 101, 3, &batch) != SAGEJS_RFOREST_STATUS_TRUNCATED ||
        batch.row_count != 3 || batch.required_rows != 26 ||
        !batch.truncated || batch.rows[2].prime != 5)
        return fail("truncation accounting");
    sagejs_rforest_batch_clear(&batch);

    printf("rforest bridge genus-2/3 residue streams passed\n");
    return 0;
}
