#include <assert.h>
#include <math.h>
#include <stddef.h>

#include "neldermead.h"
#if SAGEJS_NLOPT_HAVE_COBYLA
#include "cobyla.h"
#endif

/* Match the Wasm host adapter: elapsed-time cancellation is enforced by the
 * host callback, so the selected NLopt component never consults a native
 * process clock. */
double nlopt_seconds(void) { return 0.0; }

typedef struct {
    int callbacks;
    int constraint_callbacks;
    int *force_stop;
    int cancel_after;
} objective_state;

static double objective(unsigned n, const double *x, double *gradient,
                        void *opaque) {
    objective_state *state = (objective_state *)opaque;
    (void)n;
    (void)gradient;
    state->callbacks += 1;
    if (state->cancel_after > 0 && state->callbacks >= state->cancel_after) {
        *state->force_stop = 1;
    }
    return (x[0] - 1.0) * (x[0] - 1.0) +
           (x[1] + 2.0) * (x[1] + 2.0);
}

#if SAGEJS_NLOPT_HAVE_COBYLA
static double inequality_constraint(unsigned n, const double *x,
                                    double *gradient, void *opaque) {
    objective_state *state = (objective_state *)opaque;
    (void)n;
    state->constraint_callbacks += 1;
    if (gradient != NULL) {
        gradient[0] = 1.0;
        gradient[1] = 0.0;
    }
    return x[0] - 4.0;
}
#endif

static double equality_constraint(unsigned n, const double *x,
                                  double *gradient, void *opaque) {
    objective_state *state = (objective_state *)opaque;
    (void)n;
    state->constraint_callbacks += 1;
    if (gradient != NULL) {
        gradient[0] = 1.0;
        gradient[1] = 1.0;
    }
    return x[0] + x[1] + 1.0;
}

static nlopt_stopping stopping(int *evaluations, int maximum_evaluations,
                               int *force_stop, char **message,
                               const double *absolute_tolerance) {
    nlopt_stopping stop = {
        2u, -HUGE_VAL, 1e-12, 1e-12, 1e-12, absolute_tolerance,
        NULL, evaluations, maximum_evaluations, 0.0, 0.0,
        force_stop, message
    };
    return stop;
}

static void run_nelder_mead(int cancellation) {
    double lower[2] = {-10.0, -10.0};
    double upper[2] = {10.0, 10.0};
    double x[2] = {8.0, -9.0};
    double step[2] = {0.5, 0.5};
    double absolute_tolerance[2] = {1e-10, 1e-10};
    double minimum = HUGE_VAL;
    int evaluations = 0;
    int force_stop = 0;
    char *message = NULL;
    objective_state state = {0, 0, &force_stop, cancellation ? 3 : 0};
    nlopt_stopping stop = stopping(
        &evaluations, 2000, &force_stop, &message, absolute_tolerance
    );
    nlopt_result result = nldrmd_minimize(
        2, objective, &state, lower, upper, x, &minimum, step, &stop
    );
    assert(state.callbacks > 0);
    if (cancellation) {
        assert(result == NLOPT_FORCED_STOP);
    } else {
        assert(result > 0);
        assert(hypot(x[0] - 1.0, x[1] + 2.0) < 1e-5);
        assert(minimum < 1e-10);
    }
}

#if SAGEJS_NLOPT_HAVE_COBYLA
static void run_cobyla(int cancellation) {
    double lower[2] = {-10.0, -10.0};
    double upper[2] = {10.0, 10.0};
    double x[2] = {8.0, -9.0};
    double step[2] = {0.5, 0.5};
    double absolute_tolerance[2] = {1e-10, 1e-10};
    double minimum = HUGE_VAL;
    int evaluations = 0;
    int force_stop = 0;
    char *message = NULL;
    double constraint_tolerance = 1e-10;
    objective_state state = {0, 0, &force_stop, cancellation ? 3 : 0};
    nlopt_constraint inequality = {
        1u, inequality_constraint, NULL, NULL, &state, &constraint_tolerance
    };
    nlopt_constraint equality = {
        1u, equality_constraint, NULL, NULL, &state, &constraint_tolerance
    };
    nlopt_stopping stop = stopping(
        &evaluations, 2000, &force_stop, &message, absolute_tolerance
    );
    nlopt_result result = cobyla_minimize(
        2u, objective, &state, 1u, &inequality, 1u, &equality,
        lower, upper, x, &minimum, &stop, step
    );
    assert(state.callbacks > 0);
    assert(state.constraint_callbacks > 0);
    if (cancellation) {
        assert(result == NLOPT_FORCED_STOP);
    } else {
        assert(result > 0);
        assert(hypot(x[0] - 1.0, x[1] + 2.0) < 1e-5);
        assert(minimum < 1e-10);
    }
}
#endif

int main(void) {
    for (int iteration = 0; iteration < 512; ++iteration) {
        run_nelder_mead(0);
#if SAGEJS_NLOPT_HAVE_COBYLA
        run_cobyla(0);
#endif
    }
    run_nelder_mead(1);
#if SAGEJS_NLOPT_HAVE_COBYLA
    run_cobyla(1);
#endif
    return 0;
}
