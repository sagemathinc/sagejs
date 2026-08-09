#define _POSIX_C_SOURCE 200809L
#include <inttypes.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* Prevent whole-workload constant folding while leaving the timed loop clean. */
static volatile int64_t input_barrier = 0;

static int64_t euclid(int64_t a, int64_t b) {
    while (b != 0) {
        int64_t c = a % b;
        a = b;
        b = c;
    }
    return a;
}

typedef struct { int64_t gcd, x, y; } xgcd_result;

static xgcd_result extended_euclid(int64_t a, int64_t b) {
    int64_t prevx = 1, x = 0, prevy = 0, y = 1;
    while (b != 0) {
        int64_t q = a / b, r = a % b;
        int64_t next = prevx - q * x;
        prevx = x;
        x = next;
        next = prevy - q * y;
        prevy = y;
        y = next;
        a = b;
        b = r;
    }
    return (xgcd_result){a, prevx, prevy};
}

static int64_t inverse_mod(int64_t a, int64_t modulus) {
    if (a == 1 || modulus <= 1) return a % modulus;
    xgcd_result data = extended_euclid(a, modulus);
    if (data.gcd != 1) abort();
    int64_t answer = data.x % modulus;
    if (answer < 0) answer += modulus;
    return answer;
}

static int64_t trial_division(int64_t value) {
    static const int64_t differences[8] = {6, 4, 2, 4, 2, 4, 6, 2};
    if (value <= 1) return value;
    if (value % 2 == 0) return 2;
    if (value % 3 == 0) return 3;
    if (value % 5 == 0) return 5;
    int64_t divisor = 7, index = 1;
    int64_t limit = (int64_t)llround(sqrt((double)value));
    while (divisor <= limit) {
        if (value % divisor == 0) return divisor;
        divisor += differences[index % 8];
        index += 1;
    }
    return value;
}

static int64_t prime_counting(void) {
    const int64_t bound = 100000 + input_barrier;
    int64_t total = 0;
    for (int64_t value = 1; value <= bound; value += 1) {
        if (value > 1 && trial_division(value) == value) total += 1;
    }
    return total;
}

static int64_t gcd_loop(void) {
    const int64_t iterations = 100000 + input_barrier;
    int64_t total = 0;
    for (int64_t index = 0; index < iterations; index += 1) {
        total += euclid(92250, 922350 + index);
    }
    return total;
}

static int64_t xgcd_loop(void) {
    const int64_t iterations = 100000 + input_barrier;
    int64_t total = 0;
    for (int64_t index = 0; index < iterations; index += 1) {
        total += extended_euclid(92250, 922350 + index).gcd;
    }
    return total;
}

static int64_t inverse_mod_loop(void) {
    const int64_t bound = 100000 + input_barrier;
    int64_t total = 0;
    for (int64_t value = 1; value < bound; value += 1) {
        total += inverse_mod(value, 1073741827);
    }
    return total;
}

static int64_t sum_stride(void) {
    const int64_t bound = 1000000 + input_barrier;
    int64_t total = 0;
    for (int64_t value = 0; value < bound; value += 3) total += 1;
    return total;
}

#if defined(__GNUC__) || defined(__clang__)
__attribute__((noinline))
#endif
static int64_t recursive_fibonacci_value(int64_t n) {
    if (n == 0 || n == 1) return 1;
    return recursive_fibonacci_value(n - 1) + recursive_fibonacci_value(n - 2);
}

static int int_to_float(void) {
    static const int64_t values[6] = {1, 4, 6, 7, 8, 9};
    double total = 0.0;
    const int64_t iterations = 1000000 + input_barrier;
    for (int64_t iteration = 0; iteration < iterations; iteration += 1) {
        for (int index = 0; index < 6; index += 1) total += (double)values[index];
    }
    return total == 35000000.0;
}

static int float_abs_bench(void) {
    static const double values[5] = {1.0, -1.234567, 44324.0, 23.4, -43.44e-4};
    double total = 0.0;
    const int64_t iterations = 1000000 + input_barrier;
    for (int64_t iteration = 0; iteration < iterations; iteration += 1) {
        for (int index = 0; index < 5; index += 1) total += fabs(values[index]);
    }
    double ratio = total / 44349638911.052574;
    return ratio >= 0.999999 && ratio <= 1.000001;
}

static void python_divmod(int64_t value, int64_t divisor, int64_t *q, int64_t *r) {
    *q = value / divisor;
    *r = value % divisor;
    if (*r < 0) {
        *q -= 1;
        *r += divisor;
    }
}

static int64_t int_divmod_bench(void) {
    static const int64_t values[5] = {1, 1235, 5434, 394879374, -34453};
    int64_t total = 0;
    const int64_t iterations = 1000000 + input_barrier;
    for (int64_t iteration = 0; iteration < iterations; iteration += 1) {
        for (int index = 0; index < 5; index += 1) {
            int64_t quotient, remainder;
            python_divmod(values[index], 23, &quotient, &remainder);
            total += quotient + remainder;
        }
    }
    return total;
}

static uint64_t elapsed_ns(struct timespec start, struct timespec finish) {
    return (uint64_t)(finish.tv_sec - start.tv_sec) * UINT64_C(1000000000) +
        (uint64_t)(finish.tv_nsec - start.tv_nsec);
}

static const char *run_operation(const char *name, char result[64]) {
    if (strcmp(name, "prime_counting") == 0) {
        snprintf(result, 64, "%" PRId64, prime_counting());
    } else if (strcmp(name, "gcd_loop") == 0) {
        snprintf(result, 64, "%" PRId64, gcd_loop());
    } else if (strcmp(name, "xgcd_loop") == 0) {
        snprintf(result, 64, "%" PRId64, xgcd_loop());
    } else if (strcmp(name, "inverse_mod_loop") == 0) {
        snprintf(result, 64, "%" PRId64, inverse_mod_loop());
    } else if (strcmp(name, "sum_stride") == 0) {
        snprintf(result, 64, "%" PRId64, sum_stride());
    } else if (strcmp(name, "recursive_fibonacci") == 0) {
        snprintf(result, 64, "%" PRId64, recursive_fibonacci_value(30));
    } else if (strcmp(name, "int_to_float") == 0) {
        if (!int_to_float()) abort();
        strcpy(result, "ok");
    } else if (strcmp(name, "float_abs") == 0) {
        if (!float_abs_bench()) abort();
        strcpy(result, "ok");
    } else if (strcmp(name, "int_divmod") == 0) {
        snprintf(result, 64, "%" PRId64, int_divmod_bench());
    } else {
        fprintf(stderr, "unknown landscape operation: %s\n", name);
        exit(2);
    }
    return result;
}

static int environment_integer(const char *name, int fallback) {
    const char *value = getenv(name);
    return value == NULL || *value == '\0' ? fallback : atoi(value);
}

int main(void) {
    static const char *all_names[] = {
        "prime_counting", "gcd_loop", "xgcd_loop", "inverse_mod_loop",
        "sum_stride", "recursive_fibonacci", "int_to_float", "float_abs",
        "int_divmod",
    };
    const int all_count = (int)(sizeof(all_names) / sizeof(all_names[0]));
    const int warmups = environment_integer("SAGEJS_LANDSCAPE_WARMUPS", 1);
    const int samples = environment_integer("SAGEJS_LANDSCAPE_SAMPLES", 3);
    const char *selection = getenv("SAGEJS_LANDSCAPE_ONLY");
    printf("SAGEJS_COWASM_LANDSCAPE 1\n");
    for (int kind_index = 0; kind_index < 2; kind_index += 1) {
        const char *kind = kind_index == 0 ? "WARMUP" : "RESULT";
        const int count = kind_index == 0 ? warmups : samples;
        for (int sample = 0; sample < count; sample += 1) {
            for (int index = 0; index < all_count; index += 1) {
                const char *name = all_names[index];
                if (selection != NULL && *selection != '\0') {
                    size_t name_length = strlen(name);
                    const char *found = strstr(selection, name);
                    if (found == NULL ||
                        (found != selection && found[-1] != ',') ||
                        (found[name_length] != '\0' && found[name_length] != ',')) continue;
                }
                struct timespec start, finish;
                char answer[64];
                clock_gettime(CLOCK_MONOTONIC, &start);
                run_operation(name, answer);
                clock_gettime(CLOCK_MONOTONIC, &finish);
                printf("%s\t%d\t%s\t%" PRIu64 "\t%s\n",
                    kind, sample, name, elapsed_ns(start, finish), answer);
            }
        }
    }
    int selected_count = all_count;
    if (selection != NULL && *selection != '\0') {
        selected_count = 1;
        for (const char *cursor = selection; *cursor != '\0'; cursor += 1) {
            if (*cursor == ',') selected_count += 1;
        }
    }
    printf("COMPLETE\t%d\t%d\t%d\n", warmups, samples, selected_count);
    return 0;
}
