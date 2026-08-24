/*
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Adapted from a FLINT WASI compatibility header, originally copyright 2022
 * SageMath, Inc. See THIRD-PARTY-NOTICES.md.
 */
#ifndef SAGEJS_WASI_FLINT_FENV_COMPAT_H
#define SAGEJS_WASI_FLINT_FENV_COMPAT_H

#include <fenv.h>

/* WASI fenv functions are inert and do not define every rounding-mode macro. */
#ifndef FE_TONEAREST
#define FE_TONEAREST 0
#endif
#ifndef FE_DOWNWARD
#define FE_DOWNWARD FE_TONEAREST
#endif
#ifndef FE_UPWARD
#define FE_UPWARD FE_TONEAREST
#endif

int mkstemp(char *template);

#endif
