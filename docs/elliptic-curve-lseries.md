---
title: "Exploring elliptic-curve L-series"
---
# Exploring elliptic-curve L-series

Sage.js can evaluate the complex `L`-series of an elliptic curve over the
rationals, sample it efficiently at many points, make adaptive complex plots,
and estimate its order of vanishing at the center. The implementation is
portable across Linux, macOS, native Windows, browser WebAssembly, and the
Node-Wasm command line: smalljac supplies the coefficients and FLINT/Arb
performs the complex numerical work. Browser release tests require both Wasm
routes explicitly, so they fail if coefficient generation silently falls back
to the ordinary Python point counter.

These are numerical computations, not proofs. In particular,
`analytic_rank()` returns a probable analytic rank, and the error accounting
for general complex values does not yet rigorously enclose the quadrature
discretization error.

Every fence marked `sage test` below is executed by the documentation test
suite. You can paste the contents directly into the Sage.js command line or a
Sage.js notebook.

## Evaluate at a complex point

Construct an elliptic curve and keep its `L`-series object around. It caches
coefficients and previously computed values, so reusing it matters.

```sage test
E = EllipticCurve([1, 2, 3, 4, 999])
L = E.lseries()
z = L(1 + I)
assert abs(float(z.real()) + 0.00531031952602992) < 1e-13
assert abs(float(z.imag()) - 0.0990520277396782) < 1e-13
z
```

This produces
`-0.00531031952602992 + 0.0990520277396782*I`. Pass `prec=100`, for example,
to request more bits. The default is 53 bits.

Far enough to the right, Sage.js automatically switches from the
functional-equation/Mellin calculation to a much cheaper convergent Dirichlet
series. Thus a point such as `10 + I` is both supported and fast:

```sage test
far = L(10 + I)
assert abs(float(far.real()) - 1.00075103016354) < 1e-13
assert abs(float(far.imag()) + 0.000623246375993084) < 1e-13
assert L.last_diagnostics()["algorithm"] == "direct"
far
```

`last_diagnostics()` also exposes the chosen route, coefficient cutoff,
working precision, refinement results, and the explicitly estimated parts of
the numerical error.

## Evaluate many points together

For a line, grid, orbit, or plotting workload, use `values()` rather than a
Python loop. A batch shares its coefficient prefix and numerical grids, removes
duplicate points, evaluates conjugate pairs only once, and preserves input
order. There is no 10,000-point limit on this public interface: very large
requests are transparently divided into bounded native chunks.

```sage test
points = [CC(1, k/2) for k in range(9)]
batch = L.values(points)
assert len(batch) == len(points)
for k in (0, 4, 8):
    single = L(points[k])
    assert abs(float((batch[k] - single).real())) < 1e-13
    assert abs(float((batch[k] - single).imag())) < 1e-13
batch[:3]
```

There is also a Sage/lcalc-compatible convenience method for regularly spaced
samples. The final endpoint is excluded: with 20 samples, the step below is
`0.5*I` and the last point is `1 + 9.5*I`.

```sage test
line = L.values_along_line(CC(1, 0), CC(1, 10), 20)
assert len(line) == 20
assert line[0][0] == 1
delta = line[-1][0] - CC(1, 9.5)
assert abs(float(delta.real())) < 1e-13
assert abs(float(delta.imag())) < 1e-13
line[-1]
```

## See the functional equation numerically

The canonical completed function used by Sage.js is

\[
  \Lambda(E,s) = A^s\Gamma(s)L(E,s), \qquad
  A = \frac{\sqrt{N}}{2\pi}.
\]

It satisfies `Lambda(E,s) = w Lambda(E,2-s)`, where `w` is the root number.
This normalization is half of the value returned by PARI's `lfunlambda` for
an elliptic curve.

```sage test
E37 = EllipticCurve([0, 0, 1, -1, 0])
L37 = E37.lseries()
s = CC(0.5, 2)
left = L37.completed_value(s, prec=64)
right = E37.root_number()*L37.completed_value(2-s, prec=64)
difference = left - right
assert abs(float(difference.real())) < 1e-12
assert abs(float(difference.imag())) < 1e-12
E37.root_number()
```

This curve has root number `-1`, so its completed `L`-function is odd about
the central point.

## Draw the L-series

`complex_plot` detects the private batch interface on an elliptic `L`-series.
It evaluates conjugate points only once and begins at low visual precision,
refining only pixels whose colors are not stable. In a notebook, evaluating
`picture` displays the plot; `picture.save("elliptic-lseries.png")` writes it.

```sage test
picture = complex_plot(
    L, (0, 2), (-4, 4), plot_points=16, interpolation="nearest"
)
d = picture._plot_spec_diagnostics[0]
assert d["provider"] == "private_plot_complex_batch"
assert d["pixel_count"] == 256 and d["unstable_pixels"] == 0
assert d["runs"][0]["evaluated_point_count"] == 128
[d["accepted_by_precision"], d["runs"][0]["evaluated_point_count"]]
```

For a finished image, increase `plot_points` to 100 or more and enlarge the
rectangle. The default `plot_precision="auto"` is usually the right choice:
most pixels need only enough numerical accuracy to choose a stable color.
Set `plot_precision=53` to force full double precision throughout when making
a comparison image. Plotting uses a compact packed binary64 result rather than
constructing a nested decimal object for every pixel. It first asks the native
kernel for a cheap plan, then prepares the coefficient-dependent Mellin grid
once for all points in the accepted region. A single prepared region may hold
up to 100,000 distinct points; a dynamic point-grid work budget transparently
subdivides larger or more expensive regions. Thus, for example,
`complex_plot(L, (0, 2), (-4, 4), plot_points=300)` makes a 300-by-300 image in
one prepared region after conjugation symmetry reduces it to about 45,000
evaluations. Larger `plot_points` values keep working through smaller tiles.
Every tile shares the `L`-series' coefficient cache, and conjugate pixels are
evaluated only once with automatic precision.

### Plot on the real axis

The rank-4 curve also gives a striking ordinary real plot. Sage.js recognizes
an elliptic `L`-series passed to `plot` and evaluates one equally spaced real
grid as a packed native batch. This avoids the many individual `L(s)` calls
made by the general adaptive curve sampler. `plot(L, ...)` and `L.plot(...)`
are equivalent.

```sage test
rank_four = EllipticCurve([1, -1, 0, -79, 289])
rank_four_L = rank_four.lseries()
real_picture = plot(rank_four_L, -0.1, 2, plot_points=64)
real_diagnostic = real_picture._plot_spec_diagnostics[-1]
assert len(real_picture[0]) == 64
assert real_diagnostic["provider"] == "private_plot_real_batch"
assert real_diagnostic["packed_output"]
[real_diagnostic["equally_spaced"], real_diagnostic["native_call_count"]]
```

For a finished image, use more samples and set the visible vertical range at
display time:

```sage
picture = plot(rank_four_L, -0.1, 2, plot_points=600)
picture.show(ymin=-2, ymax=2)
```

The default `plot_precision="auto"` computes a nested low-precision pair that
is appropriate for drawing. An integer from 16 through 53 requests a fixed
precision floor. The specialized curve sampler is deliberately non-adaptive:
increase `plot_points` when you want more geometric resolution. The usual
line, fill, legend, and axes options continue to work.

## Estimate analytic rank

The same coefficient and completed-`L` infrastructure estimates the order of
vanishing at `s=1`. This example is a celebrated rank-4 curve.

```sage test
high_rank = EllipticCurve([1, -1, 0, -79, 289])
assert high_rank.analytic_rank() == 4
high_rank.analytic_rank()
```

This answer is deliberately documented as probable. Proving an analytic rank
of at least four for even one elliptic curve over the rationals remains an open
problem.

## Choosing an interface

- Use `L(s)` or `L.value(s, prec=...)` for a single point.
- Use `L.values(points, prec=...)` for unrelated batches and rectangular grids.
- Use `L.values_along_line(s0, s1, n, prec=...)` for line samples.
- Use `plot(L, a, b, plot_points=...)` for a packed real-axis plot.
- Use `complex_plot(L, ...)` for adaptive visual-precision evaluation.
- Use `L.completed_value(s)` when studying the functional equation.
- Use `E.analytic_rank()` for the probable central order of vanishing.

The supported production domain is intentionally moderate in height. Large
imaginary parts, extensive zero searches, and rigorous certification are
separate problems rather than hidden promises of this interface.
