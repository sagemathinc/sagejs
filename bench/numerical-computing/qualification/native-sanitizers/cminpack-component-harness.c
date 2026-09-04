#include <assert.h>
#include <math.h>
#include <stddef.h>
#include <stdlib.h>

#include "cminpack.h"

typedef struct {
    int fail;
    int callbacks;
} callback_state;

static int residual(void *opaque, int m, int n, const double *x,
                    double *fvec, int iflag) {
    callback_state *state = (callback_state *)opaque;
    (void)m;
    (void)n;
    (void)iflag;
    state->callbacks += 1;
    if (state->fail) return -1001;
    fvec[0] = x[0] - 1.0;
    fvec[1] = x[1] + 2.0;
    return 0;
}

static int derivative(void *opaque, int m, int n, const double *x,
                      double *fvec, double *fjac, int ldfjac, int iflag) {
    callback_state *state = (callback_state *)opaque;
    (void)m;
    (void)n;
    state->callbacks += 1;
    if (state->fail) return -1001;
    if (iflag == 1) {
        fvec[0] = x[0] - 1.0;
        fvec[1] = x[1] + 2.0;
    } else if (iflag == 2) {
        fjac[0] = 1.0;
        fjac[1] = 0.0;
        fjac[ldfjac] = 0.0;
        fjac[ldfjac + 1] = 1.0;
    }
    return 0;
}

static void run_lmdif(int inject_failure) {
    const int m = 2;
    const int n = 2;
    double x[2] = {8.0, -9.0};
    double fvec[2] = {0.0, 0.0};
    double diag[2] = {1.0, 1.0};
    double fjac[4] = {0.0, 0.0, 0.0, 0.0};
    int ipvt[2] = {0, 0};
    double qtf[2] = {0.0, 0.0};
    double wa1[2] = {0.0, 0.0};
    double wa2[2] = {0.0, 0.0};
    double wa3[2] = {0.0, 0.0};
    double wa4[2] = {0.0, 0.0};
    int nfev = 0;
    callback_state state = {inject_failure, 0};
    int info = lmdif(
        residual, &state, m, n, x, fvec, 1e-12, 1e-12, 1e-12, 200,
        0.0, diag, 1, 100.0, 0, &nfev, fjac, m, ipvt, qtf,
        wa1, wa2, wa3, wa4
    );
    assert(state.callbacks > 0);
    if (inject_failure) {
        assert(info == -1001);
    } else {
        assert(info > 0);
        assert(hypot(x[0] - 1.0, x[1] + 2.0) < 1e-9);
    }
}

static void run_lmder(int inject_failure) {
    const int m = 2;
    const int n = 2;
    double x[2] = {8.0, -9.0};
    double fvec[2] = {0.0, 0.0};
    double diag[2] = {1.0, 1.0};
    double fjac[4] = {0.0, 0.0, 0.0, 0.0};
    int ipvt[2] = {0, 0};
    double qtf[2] = {0.0, 0.0};
    double wa1[2] = {0.0, 0.0};
    double wa2[2] = {0.0, 0.0};
    double wa3[2] = {0.0, 0.0};
    double wa4[2] = {0.0, 0.0};
    int nfev = 0;
    int njev = 0;
    callback_state state = {inject_failure, 0};
    int info = lmder(
        derivative, &state, m, n, x, fvec, fjac, m, 1e-12, 1e-12,
        1e-12, 200, diag, 1, 100.0, 0, &nfev, &njev, ipvt, qtf,
        wa1, wa2, wa3, wa4
    );
    assert(state.callbacks > 0);
    if (inject_failure) {
        assert(info == -1001);
    } else {
        assert(info > 0);
        assert(hypot(x[0] - 1.0, x[1] + 2.0) < 1e-9);
    }
}

int main(void) {
    for (int iteration = 0; iteration < 512; ++iteration) {
        run_lmdif(0);
        run_lmder(0);
    }
    run_lmdif(1);
    run_lmder(1);
    return 0;
}
