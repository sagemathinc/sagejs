#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>

#include <sagejs/hyperelliptic/smalljac.h>

static int fail(const char *message)
{
    fprintf(stderr, "smalljac bridge test failed: %s\n", message);
    return 1;
}

static const sagejs_smalljac_lpoly_row *find_lpoly_row(
    const sagejs_smalljac_lpoly_batch *batch, uint64_t prime)
{
    for (size_t index = 0; index < batch->row_count; index += 1)
        if (batch->rows[index].prime == prime)
            return &batch->rows[index];
    return NULL;
}

int main(void)
{
    static const struct {
        uint64_t prime;
        int64_t c1;
        int64_t c2;
    } expected[] = {
        {5, 0, 10},
        {11, -4, 14},
        {19, -4, 14},
        {29, 5, 40}
    };
    sagejs_smalljac_lpoly_batch lpolys;
    sagejs_smalljac_group_batch groups;
    const sagejs_smalljac_lpoly_row *row;

    if (!sagejs_smalljac_available())
        return fail("backend unavailable");
    if (sagejs_smalljac_lpoly_batch_compute(
            "x^5+x+1", 2, 29, 0, &lpolys) !=
        SAGEJS_SMALLJAC_STATUS_OK)
        return fail("quintic batch status");
    if (lpolys.genus != 2 || lpolys.row_count != 10 ||
        lpolys.required_rows != 10 || lpolys.truncated)
        return fail("quintic batch shape");
    for (size_t index = 0; index < sizeof(expected) / sizeof(expected[0]);
         index += 1)
    {
        row = find_lpoly_row(&lpolys, expected[index].prime);
        if (row == NULL || !row->good || row->coefficient_count != 2 ||
            row->coefficients[0] != expected[index].c1 ||
            row->coefficients[1] != expected[index].c2)
            return fail("quintic oracle coefficient");
    }
    row = find_lpoly_row(&lpolys, 2);
    if (row == NULL || row->good || row->coefficient_count != 0 ||
        row->status != SAGEJS_SMALLJAC_ROW_BAD_REDUCTION)
        return fail("bad-prime row alignment");
    sagejs_smalljac_lpoly_batch_clear(&lpolys);

    if (sagejs_smalljac_lpoly_batch_compute(
            "x^5+x+1", 2, 29, 3, &lpolys) !=
        SAGEJS_SMALLJAC_STATUS_TRUNCATED)
        return fail("truncated status");
    if (lpolys.row_count != 3 || lpolys.required_rows != 10 ||
        !lpolys.truncated || lpolys.rows[2].prime != 5 ||
        lpolys.rows[2].coefficients[1] != 10)
        return fail("truncated row accounting");
    sagejs_smalljac_lpoly_batch_clear(&lpolys);

    if (sagejs_smalljac_lpoly_batch_compute(
            "x^6+x+1", 5, 5, 0, &lpolys) !=
            SAGEJS_SMALLJAC_STATUS_OK ||
        lpolys.row_count != 1 || lpolys.rows[0].coefficients[0] != 0 ||
        lpolys.rows[0].coefficients[1] != 5)
        return fail("sextic coefficient");
    sagejs_smalljac_lpoly_batch_clear(&lpolys);

    if (sagejs_smalljac_lpoly_batch_compute(
            "[x^5+x+1,x]", 5, 5, 0, &lpolys) !=
            SAGEJS_SMALLJAC_STATUS_OK ||
        lpolys.row_count != 1 || lpolys.rows[0].coefficients[0] != -1 ||
        lpolys.rows[0].coefficients[1] != 5)
        return fail("nonzero-h coefficient");
    sagejs_smalljac_lpoly_batch_clear(&lpolys);

    if (sagejs_smalljac_group_batch_compute(
            "x^5+x+1", 5, 5, 0, &groups) !=
            SAGEJS_SMALLJAC_STATUS_OK ||
        groups.row_count != 1 || groups.rows[0].invariant_count != 2 ||
        groups.rows[0].invariants[0] != 6 ||
        groups.rows[0].invariants[1] != 6)
        return fail("odd-degree invariant factors");
    sagejs_smalljac_group_batch_clear(&groups);

    if (sagejs_smalljac_group_batch_compute(
            "x^6+x+1", 5, 5, 0, &groups) !=
        SAGEJS_SMALLJAC_STATUS_UNSUPPORTED_CURVE)
        return fail("even-degree group capability");
    sagejs_smalljac_group_batch_clear(&groups);

    printf("smalljac bridge genus-2 coefficient and group streams passed\n");
    return 0;
}
