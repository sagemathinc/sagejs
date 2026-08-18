/* Standalone packed genus-2 smalljac benchmark.
 *
 * Compile against the same pinned libraries as the Node addon.  This file is
 * not linked into Sage.js; it measures the host-neutral boundary without
 * Node-API or mathematical-object construction overhead.
 */

#include "sagejs/hyperelliptic/smalljac.h"

#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

static uint64_t hash_word(uint64_t hash, uint64_t value)
{
    for (unsigned int index = 0; index < 8; index += 1)
    {
        hash ^= (uint8_t) (value >> (8 * index));
        hash *= UINT64_C(1099511628211);
    }
    return hash;
}

int main(int argc, char **argv)
{
    uint64_t stop = UINT64_C(100000);
    unsigned long repeat = 3;
    const char *curve = "x^5+x+1";
    if (argc > 1)
        stop = (uint64_t) strtoull(argv[1], NULL, 10);
    if (argc > 2)
        repeat = strtoul(argv[2], NULL, 10);
    if (argc > 3)
        curve = argv[3];
    if (stop < 3 || stop > SAGEJS_SMALLJAC_LPOLY_MAX_PRIME || repeat < 1)
    {
        fputs("usage: smalljac_batch [stop>=3] [repeat>=1] [curve]\n", stderr);
        return 2;
    }

    for (unsigned long sample = 0; sample < repeat; sample += 1)
    {
        sagejs_smalljac_lpoly_batch batch;
        clock_t started = clock();
        int32_t status = sagejs_smalljac_lpoly_batch_compute(
            curve, UINT64_C(3), stop, 0, &batch);
        clock_t finished = clock();
        if (status != SAGEJS_SMALLJAC_STATUS_OK)
        {
            fprintf(stderr, "smalljac status %" PRId32 "\n", status);
            return 1;
        }
        uint64_t hash = UINT64_C(14695981039346656037);
        size_t good = 0;
        for (size_t row = 0; row < batch.row_count; row += 1)
        {
            hash = hash_word(hash, batch.rows[row].prime);
            hash = hash_word(hash, batch.rows[row].good);
            hash = hash_word(hash, batch.rows[row].coefficient_count);
            hash = hash_word(hash, (uint64_t) batch.rows[row].status);
            for (unsigned int index = 0; index < SAGEJS_SMALLJAC_MAX_GENUS;
                 index += 1)
                hash = hash_word(
                    hash, (uint64_t) batch.rows[row].coefficients[index]);
            good += batch.rows[row].good;
        }
        printf(
            "{\"stop\":%" PRIu64 ",\"sample\":%lu,\"cpu_ms\":%.6f,"
            "\"rows\":%zu,\"good_rows\":%zu,\"fnv64\":\"%016" PRIx64
            "\"}\n",
            stop, sample,
            1000.0 * (double) (finished - started) / (double) CLOCKS_PER_SEC,
            batch.row_count, good, hash);
        sagejs_smalljac_lpoly_batch_clear(&batch);
    }
    return 0;
}
