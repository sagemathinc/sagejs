#define _POSIX_C_SOURCE 200809L
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static const double expected_nbody = -0.16908926275527303;
static const double expected_matrix = 166742891853.24692;

static uint64_t now_ns(void)
{
    struct timespec value;
    clock_gettime(CLOCK_MONOTONIC, &value);
    return (uint64_t) value.tv_sec * UINT64_C(1000000000) +
        (uint64_t) value.tv_nsec;
}

static int environment_integer(const char *name, int fallback)
{
    const char *text = getenv(name);
    return text == NULL || *text == '\0' ? fallback : atoi(text);
}

static int close_enough(double actual, double expected)
{
    return fabs(actual - expected) <=
        1e-12 * fmax(1.0, fabs(expected));
}

static void initial_state(double state[35])
{
    const double days = 365.24;
    const double pi = 3.14159265358979323846;
    const double solar_mass = 4.0 * pi * pi;
    const double values[35] = {
        0, 0, 0, 0, 0, 0, solar_mass,
        4.84143144246472090, -1.16032004402742839,
        -1.03622044471123109e-1,
        1.66007664274403694e-3 * days,
        7.69901118419740425e-3 * days,
        -6.90460016972063023e-5 * days,
        9.54791938424326609e-4 * solar_mass,
        8.34336671824457987, 4.12479856412430479,
        -4.03523417114321381e-1,
        -2.76742510726862411e-3 * days,
        4.99852801234917238e-3 * days,
        2.30417297573763929e-5 * days,
        2.85885980666130812e-4 * solar_mass,
        1.28943695621391310e1, -1.51111514016986312e1,
        -2.23307578892655734e-1,
        2.96460137564761618e-3 * days,
        2.37847173959480950e-3 * days,
        -2.96589568540237556e-5 * days,
        4.36624404335156298e-5 * solar_mass,
        1.53796971148509165e1, -2.59193146099879641e1,
        1.79258772950371181e-1,
        2.68067772490389322e-3 * days,
        1.62824170038242295e-3 * days,
        -9.51592254519715870e-5 * days,
        5.15138902046611451e-5 * solar_mass,
    };
    double px = 0.0, py = 0.0, pz = 0.0;
    memcpy(state, values, sizeof(values));
    for (size_t body = 0; body < 5; body++)
    {
        const size_t start = body * 7;
        const double mass = state[start + 6];
        px -= state[start + 3] * mass;
        py -= state[start + 4] * mass;
        pz -= state[start + 5] * mass;
    }
    state[3] = px / solar_mass;
    state[4] = py / solar_mass;
    state[5] = pz / solar_mass;
}

static double nbody_advance_energy(
    double *state, double dt, uint64_t steps, uint64_t bodies)
{
    for (uint64_t step = 0; step < steps; step++)
    {
        for (uint64_t left_index = 0; left_index < bodies; left_index++)
        {
            double *left = state + left_index * 7;
            for (uint64_t right_index = left_index + 1;
                 right_index < bodies; right_index++)
            {
                double *right = state + right_index * 7;
                const double dx = left[0] - right[0];
                const double dy = left[1] - right[1];
                const double dz = left[2] - right[2];
                const double distance_squared =
                    dx * dx + dy * dy + dz * dz;
                const double magnitude = dt /
                    (distance_squared * sqrt(distance_squared));
                const double left_mass_magnitude = left[6] * magnitude;
                const double right_mass_magnitude = right[6] * magnitude;
                left[3] -= dx * right_mass_magnitude;
                left[4] -= dy * right_mass_magnitude;
                left[5] -= dz * right_mass_magnitude;
                right[3] += dx * left_mass_magnitude;
                right[4] += dy * left_mass_magnitude;
                right[5] += dz * left_mass_magnitude;
            }
        }
        for (uint64_t body_index = 0; body_index < bodies; body_index++)
        {
            double *body = state + body_index * 7;
            body[0] += dt * body[3];
            body[1] += dt * body[4];
            body[2] += dt * body[5];
        }
    }
    double energy = 0.0;
    for (uint64_t left_index = 0; left_index < bodies; left_index++)
    {
        double *left = state + left_index * 7;
        for (uint64_t right_index = left_index + 1;
             right_index < bodies; right_index++)
        {
            double *right = state + right_index * 7;
            const double dx = left[0] - right[0];
            const double dy = left[1] - right[1];
            const double dz = left[2] - right[2];
            const double distance_squared = dx * dx + dy * dy + dz * dz;
            energy -= left[6] * right[6] / sqrt(distance_squared);
        }
        energy += left[6] * (
            left[3] * left[3] + left[4] * left[4] + left[5] * left[5]) / 2.0;
    }
    return energy;
}

static void matrix_inputs(double *left, double *right, double *scratch)
{
    for (size_t index = 0; index < 900; index++)
    {
        left[index] = (double) ((index * 17 + 3) % 97) / 97.0;
        right[index] = (double) ((index * 19 + 5) % 89) / 890.0;
        scratch[index] = 0.0;
    }
}

static double matrix_multiply_repeated(
    double *left, double *right, double *scratch,
    uint64_t size, uint64_t repetitions)
{
    double *current = left;
    double *target = scratch;
    for (uint64_t repeat = 0; repeat < repetitions; repeat++)
    {
        for (uint64_t row = 0; row < size; row++)
        {
            for (uint64_t column = 0; column < size; column++)
            {
                double accumulator = 0.0;
                for (uint64_t index = 0; index < size; index++)
                {
                    accumulator += current[row * size + index] *
                        right[index * size + column];
                }
                target[row * size + column] = accumulator;
            }
        }
        double *temporary = current;
        current = target;
        target = temporary;
    }
    double checksum = 0.0;
    for (uint64_t index = 0; index < size * size; index++)
        checksum += current[index];
    return checksum;
}

int main(void)
{
    const int warmups = environment_integer("SAGEJS_BUFFER_WARMUPS", 1);
    const int samples = environment_integer("SAGEJS_BUFFER_SAMPLES", 3);
    const char *only = getenv("SAGEJS_BUFFER_ONLY");
    const int do_nbody = only == NULL || strstr(only, "nbody") != NULL;
    const int do_matrix = only == NULL ||
        strstr(only, "matrix_multiplication") != NULL;
    const int selected = do_nbody + do_matrix;
    puts("SAGEJS_COWASM_BUFFERS 1");
    for (int measured = 0; measured < 2; measured++)
    {
        const char *kind = measured ? "RESULT" : "WARMUP";
        const int count = measured ? samples : warmups;
        for (int sample = 0; sample < count; sample++)
        {
            if (do_nbody)
            {
                double state[35];
                initial_state(state);
                const uint64_t started = now_ns();
                const double answer = nbody_advance_energy(
                    state, 0.01, 20000, 5);
                const uint64_t elapsed = now_ns() - started;
                if (!close_enough(answer, expected_nbody)) return 1;
                printf("%s\t%d\tnbody\t%llu\tok\n", kind, sample,
                    (unsigned long long) elapsed);
            }
            if (do_matrix)
            {
                double left[900], right[900], scratch[900];
                matrix_inputs(left, right, scratch);
                const uint64_t started = now_ns();
                const double answer = matrix_multiply_repeated(
                    left, right, scratch, 30, 50);
                const uint64_t elapsed = now_ns() - started;
                if (!close_enough(answer, expected_matrix)) return 1;
                printf("%s\t%d\tmatrix_multiplication\t%llu\tok\n",
                    kind, sample, (unsigned long long) elapsed);
            }
        }
    }
    printf("COMPLETE\t%d\t%d\t%d\n", warmups, samples, selected);
    return 0;
}
