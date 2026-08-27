---
title: "BSD arithmetic for genus-2 and genus-3 Jacobians"
---
# BSD arithmetic for genus-2 and genus-3 Jacobians

Sage.js provides a factor-by-factor Birch--Swinnerton-Dyer arithmetic layer
for Jacobians of genus-2 and genus-3 hyperelliptic curves over `QQ`.  Its main
design rule is simple: a missing proof remains missing.  A numerical leading
term is not promoted to an algebraic-rank proof, a geometric component group
is not substituted for a rational Tamagawa number, and an unknown
Mordell--Weil index is not rounded away.

For a rank-`r` abelian variety `A` with dual `Adual`, Sage.js uses

```text
             L^(r)(A,1)/r! * #A(Q)_tors * #Adual(Q)_tors
Q(A) = -------------------------------------------------------.
               Omega_A * Reg(A,Adual) * product_p c_p(A)
```

For a principally polarized Jacobian and a full-rank subgroup `Gamma`, the
computed quantity is named

```text
sha_over_index_squared = #Sha(J/QQ) / [J(Q)/tors : Gamma]^2
```

under BSD.  `analytic_sha()` is available only after a replayable subgroup
index proof is attached.  Merely binding an externally supplied index to the
record is useful provenance, but is deliberately not a mathematical proof.

Every fence marked `sage test` in this guide is executed by the documentation
test suite.  The longer genus-3 height oracle is marked separately because its
deliberately conservative period/theta refinement takes several minutes.

## A synthetic supplied-data quotient

> **This first example uses deliberately unrealistic fake data.**  It does not
> compute the invariants of the displayed curve and should not be interpreted
> as a research calculation.  Its unusually tidy integers make the BSD
> normalization, exact-factor bookkeeping, provenance, and serialization easy
> to inspect: `L''(1)=12`, its Taylor coefficient is `12/2!=6`, and the
> regulator is `det(diag(2,3))=6`.

The point is to illustrate the supplied-data assembly interface used when
periods, Mordell--Weil data, or local arithmetic come from another program.
The interface records every normalization and remains portable ordinary
Python.  The following section replaces these fake inputs by a genuine
analytic computation.

```sage test
from sagejs.hyperelliptic_curves.bsd import (
    BSDAnalyticQuotient,
    BSDArithmeticInput,
    LeadingTermData,
    Provenance,
    RankEvidence,
)

source = Provenance.supplied(
    "synthetic documentation fixture",
    reference="not a mathematical computation",
)

# This is L''(J,1), not its Taylor coefficient.  The quotient divides by 2!.
leading = LeadingTermData.supplied(2, 12, +1, provenance=source)

data = BSDArithmeticInput.supplied_jacobian(
    leading_term=leading,
    algebraic_rank=RankEvidence("supplied", 2, source),
    # Exact supplied factors use integers or rationals, not decimal strings.
    real_period=2,
    real_component_factor=1,
    period_differential_basis="supplied Neron top differential",
    real_period_is_total=True,
    height_pairing=[[2, 0], [0, 3]],
    tamagawa_numbers={2: 1, 5: 2},
    bad_primes=(2, 5),
    torsion_order=1,
    subgroup_basis=[{"label": "P1"}, {"label": "P2"}],
    curve_model={
        "base_ring": "QQ",
        "f_coefficients": ["1", "-1", "0", "0", "0", "1"],
        "h_coefficients": ["0"],
    },
    backend_versions={"source": "synthetic documentation fixture"},
)

B = BSDAnalyticQuotient(data)
print(B.leading_derivative())
print(B.leading_taylor_coefficient())
print(B.regulator())
print(B.tamagawa_product())
print(B.sha_over_index_squared())
print(B.diagnostics())
assert B.sha_over_index_squared().to_dict()["numerator"] == "1"
assert B.sha_over_index_squared().to_dict()["denominator"] == "4"
```

Positive-rank records require a reproducible basis record of the same size as
the rank.  For actual Mumford divisors, use
`sagejs.hyperelliptic_curves.torsion.rational_mumford_data(J, P)` rather than
an informal label.  Rank zero uses the conventional regulator `1`, but it is
not declared to be the full Mordell--Weil group unless algebraic rank zero is
proved.

The combined result is normally `rigorous=False`: current central derivatives
and periods are checked by precision refinement but do not yet enclose every
analytic truncation error.  Exact arithmetic factors remain exact inside that
numerical result.

## Preparing the analytic leading term

The reusable `LFunctionInit` object computes the central value and derivatives
once and caches the central-weight plan:

```sage
R = PolynomialRing(QQ, "x")
x = R.gen()
# This generalized model has certified global data at every bad prime.
# The tempting classical model y^2=x^5-x+1 is useful for heights below, but
# its bad reduction at 2 is intentionally outside the current global engine.
C_lseries = HyperellipticCurve(x, x**3 - x + 1)

L = C_lseries.lseries().init(prec=160, max_order=4)
rank, derivative = L.leading_derivative()
print(rank, derivative)

leading = LeadingTermData.from_lfunction_init(L)
print(leading.rank.status)       # probable
print(leading.taylor_coefficient())
print(L.diagnostics())
assert rank == 0 and leading.rank.status == "probable"
```

`from_lfunction_init` requires a stabilized, isolated derivative and records
the actual prepared precision and backend diagnostics.  It does not call a
probable analytic rank “proved.”  The 160-bit order-four initialization above
is intentionally not part of the routine documentation test tier: it is a
substantial analytic computation, not a quick-start smoke test.

## Atomic automatic assembly

The curve-level entry point computes each factor independently and always
returns one `BSDPipelineReport`.  A complete report proxies the usual quotient
methods; an incomplete report is a checkpoint containing the factors that did
succeed and makes no BSD quotient claim:

```sage
R = PolynomialRing(QQ, "x")
x = R.gen()
C_lseries = HyperellipticCurve(x, x**3 - x + 1)

rank_source = Provenance.supplied(
    "independent Mordell--Weil computation",
    reference="research notebook, cell 27",
)

report = C_lseries.bsd_analytic_quotient(
    subgroup=[],
    rank=RankEvidence("supplied", 0, rank_source),
    prec=80,
    overrides={
        # Sage.js computes the model period.  This supplied index is the
        # separately checked change to the global Neron differential lattice.
        "neron_lattice_index": 1,
        "period_normalization_provenance": {
            "source": "integral-model calculation",
            "reference": "notebook, cell 19",
        },
    },
)

if report.complete:
    print(report.leading_taylor_coefficient())
    print(report.tamagawa_product())
    print(report.sha_over_index_squared())
else:
    print(report.missing_factors())
    for name in report.missing_factors():
        print(name, report.factor(name).reason)

assert report.complete or report.to_dict()["claim"] == "no_bsd_quotient_claimed"
```

The automatically computed quotient is atomic.  An unsupported Tamagawa
prime, a bounded-but-not-exact torsion group, missing Neron normalization, or
the wrong number of subgroup generators leaves `report.complete == False`.
Use `on_incomplete="raise"` when a batch should stop instead of recording the
checkpoint.  Typed objects can be passed in `overrides` when a factor comes
from another program; every such input retains its own provenance, and unknown
override names are rejected.  Like the high-precision initialization it uses,
this full quotient is intentionally outside the routine documentation test
tier.

`BSDPipelineReport.to_json()`, `.from_json()`, and `.sqlite_record()` support
checkpoint/restart workflows.  The SQLite row exists even for an incomplete
report and records its missing-factor list without numerator or denominator
columns that could be mistaken for a quotient.

## Real periods and Abel--Jacobi coordinates

The quick examples below share this tested curve fixture:

```sage test
R = PolynomialRing(QQ, "x")
x = R.gen()
C_lseries = HyperellipticCurve(x, x**3 - x + 1)
assert C_lseries.conductor() == 713
```

`real_period` uses the completed model `Y^2=h^2+4f` and the differential basis

```text
x^i dx/(2y+h),  0 <= i < g.
```

It returns the full period matrix, normalized Siegel matrix, exact real-locus
topology, component factor, and refinement diagnostics:

```sage test
C_period = HyperellipticCurve(x**5 - x + 1)
period = C_period.real_period(prec=64)
print(period.model_period())
print(period.period_matrix())
print(period.siegel_matrix())
print(period.real_components())
print(period.verify())
assert period.verify()["verified"] and not period.rigorous
```

The model period is not automatically a BSD period.  A Neron-normalized
period is returned only when the differential determinant or lattice index is
supplied with provenance:

```sage test
period_neron = C_period.real_period(
    prec=64,
    normalization="neron",
    neron_lattice_index=2,
    provenance={"source": "independent integral-model computation"},
)
print(period_neron.neron_period())
assert 2 * period_neron.neron_period() == period.model_period()
```

Odd-degree models also support rational points and split rational Mumford
support in the Abel--Jacobi map:

```sage test
Q_period = C_period([0, 1])
z = C_period.abel_jacobi(Q_period, period_result=period, prec=64)
print(z.vector())
print(z.diagnostics())
assert z.verify()["verified"] and not z.rigorous
```

For 1 through 64 affine rational points on the same odd-degree model, use
`period.abel_jacobi_batch(points, prec=...)`. The batch isolates the exact
roots and topology once, evaluates every differential and path through one
bounded Arb/Acb boundary with at least two independent refinements, and
publishes ordinary `AbelJacobiResult` values. `verify()` independently replays
the source calculation; the scalar route is the portable capability fallback.

These analytic objects are refinement-stable, not claimed Arb enclosures;
their records say `rigorous=False`.

## Tamagawa numbers and deficient places

At a supported prime, Sage.js distinguishes the geometric component group
from its Frobenius-fixed rational subgroup:

```sage test
p = 5
f_tamagawa = x * (x - p**2) * (x - 1) * (x - 2) * (x - 3)
C_tamagawa = HyperellipticCurve(f_tamagawa)
local = C_tamagawa.tamagawa_data(p)
print(
    p,
    local.geometric_invariants,
    local.rational_invariants,
    local.tamagawa_number(),
)
print(C_tamagawa.tamagawa_product(primes=(p,)))
assert local.curve_certified and local.tamagawa_number() == 4
```

The exact initial envelope includes good reduction, the implemented genus-2
almost-good cases, and certified split semistable genus-2/3 cluster pictures
at odd primes.  Unsupported wild, bad characteristic-two, nonsplit, or
insufficient regular-model cases return a structured capability result.  The
global product is atomic: one unsupported bad prime prevents a complete
answer.  The explicit `primes=(5,)` above computes the product for that
demonstration prime; omit `primes` only when the complete bad-prime set is in
the supported envelope.

Deficiency is a separate local arithmetic question:

```sage test
for place in ["infinity"] + list(C_lseries.bad_primes()):
    result = C_lseries.local_deficiency(place)
    print(place, result.status, result.decision)

diagnostic = C_lseries.global_deficiency_diagnostic(
    canonical_principal_polarization=True,
)
print(diagnostic.to_dict())
assert diagnostic.complete and diagnostic.sha_order_shape == "square_if_finite"
```

The global diagnostic applies the Poonen--Stoll square/twice-square theorem
only to a Jacobian with its canonical principal polarization, complete
bad-prime evidence, and certified local decisions.  It never changes or
rounds the analytic quotient.

## Rational torsion

Several good reductions give a replayable upper bound.  Rational branch
factorization gives the full rational 2-torsion, and supplied rational Mumford
divisors are checked exactly:

```sage test
C_torsion = HyperellipticCurve(x**5 - x + 1)
J_torsion = C_torsion.jacobian()
upper = J_torsion.torsion_bound()
print(
    upper.upper_bound,
    [row["prime"] for row in upper.upper_bound_certificate["good_reductions"]],
)

two = J_torsion.rational_two_torsion()
print(two.invariants, two.generators)

torsion = J_torsion.torsion_subgroup(two.generators)
print(torsion.lower_bound, torsion.upper_bound, torsion.status)
if torsion.exact:
    print(torsion.order())
assert torsion.exact and torsion.order() == 1
```

Failure to find an odd-torsion point never lowers the upper bound.
`order()` refuses unless the explicit generators attain the certified bound.

## Heights, pairings, and regulators

For an odd-degree integral genus-2 model in the certified classical envelope,
the public divisor API computes Kummer canonical heights with explicit finite
and archimedean correction diagnostics:

```sage test
R = PolynomialRing(QQ, "x")
x = R.gen()
C_height = HyperellipticCurve(x**5 - x + 1)
J_height = C_height.jacobian()
P_height = J_height([x, 1])
Q_height = J_height([x - 1, 1])

hP = P_height.canonical_height(precision=128)
H = J_height.height_pairing([P_height, Q_height], precision=128)
Reg = J_height.regulator([P_height, Q_height], precision=128)

print(hP.ball, hP.rigorous)
print(H.matrix)
print(Reg.ball, Reg.status)
assert hP.rigorous and H.rigorous and Reg.rigorous
```

The convention is

```text
<P,Q> = (hhat(P+Q)-hhat(P)-hhat(Q))/2,
```

and the determinant of this Gram matrix is the BSD regulator.  Integral basis
changes transform the pairing by `M^T H M` and the regulator by `det(M)^2`.
Generalized `h` arithmetic is exact, but a caller-supplied height-difference
bound remains explicitly conditional unless its theorem certificate is
replayed.

For local certified genus-2 pairings, one proof transaction deduplicates the
required diagonal and sum divisors, shares frozen Flynn quartics and theorem
bounds, and evaluates the missing modular, dyadic, outward-log, and exact
small-step recurrences in bounded source-transparent batches. Canonical-height
and pairing records are committed together only after every point and the
final cancellation check pass. A cancelled or failed transaction publishes no
partial proof state. Reused pairings and regulators restore detached primitive
proof payloads, revalidate the exact model, ordered points, parameters, and
Flynn tables, and return fresh result objects. The ordinary scalar route
remains the exact differential oracle.

Genus 3 uses Faltings--Hriljac arithmetic in a narrower envelope: odd-degree
models, rational infinity, split rational Mumford support, a complete finite
intersection plan, and compatible period/theta data.  Missing component maps,
bad reduction at `2`, nonsplit support, or unresolved theta data produce a
structured capability error rather than an incomplete height.

The Abel--Jacobi and theta refinement budgets are explicit.  The following
is the checked difficult oracle fixture.  It is genuinely executable, but is
not part of the ordinary documentation test because it takes about six
minutes on the development host:

```sage
f3 = x**7 - 9*x**6 + 28*x**5 - 32*x**4 + x**3 + 17*x**2 - 6*x
C3 = HyperellipticCurve(f3, 1)
J3 = C3.jacobian()
P3 = J3([x * (x - 1) * (x - 2), 0])
hP3 = P3.canonical_height(
    moving_x=3,
    prec=64,
    abel_max_refinements=6,
    theta_radius=6,
)
print(hP3.value)
# 2.1403441482740588613361202616675490537...
```

The checked Magma V2.18-5 genus-3 oracle in
`test/hyperelliptic-bsd-oracles/` compares exactly this bounded public route
with Magma after the polarization-preserving change `Y=2*y+1`.  The finite
support is certified at six primes, and the complete numerical height agrees
with Magma to about 20 significant decimal digits.  This is a
refinement-stable numerical comparison, not a rigorous analytic enclosure;
the default smaller refinement budget still fails closed on that deliberately
difficult fixture.

## Saturation and subgroup indices

Saturation keeps distinct the following statements:

- the supplied points are independent;
- they have a separately proved full rank;
- their free quotient is saturated at primes in `S`;
- a separately proved global index bound makes this sufficient globally.

```sage test
S_height = J_height.saturate(
    [P_height],
    primes=[2],
    reduction_primes=[7],
    use_height_pairing=False,
)
print(S_height.basis)
for result in S_height.prime_results:
    print(result["prime"], result["status"], result["free_quotient_saturated"])
print(S_height.global_status["reason"])
print(S_height.verify())
assert S_height.verify()
```

Reduction maps and negative rational-division claims must have replayable
curve-and-basis-bound certificates.  Injected or externally supplied claims
remain conditional.  A probable analytic rank is never used as a full-rank
proof.  Proved algebraic-rank, Selmer, torsion, or index inputs use the
explicit `*_provenance` and registered `assumption_verifiers` interface; a
mapping containing only `proved=True` is intentionally insufficient.

When a saturation result proves the full Mordell--Weil group using only the
closed Sage.js verifier authorities, it can unlock `analytic_sha()` without a
free-form certificate:

The saturation result and BSD report must refer to the same curve and ordered
basis.  A reusable helper makes that precondition visible without pretending
that the independent examples above compose:

```sage test
from sagejs.hyperelliptic_curves.bsd import (
    subgroup_index_certificate_from_saturation,
)

def close_sha_with_saturation(bsd_report, saturation):
    certificate = subgroup_index_certificate_from_saturation(
        bsd_report.arithmetic_input(),
        saturation,
    )
    proved = bsd_report.with_subgroup_index(
        saturation.index_factor_from_input,
        certificate=certificate,
    )
    return proved.analytic_sha()
```

The replay reconstructs the exact `QQ` curve, ordered Mumford basis,
regulator binding, rank/full-group proof, and original-basis index.  A
saturation run depending on an arbitrary caller callback remains
`external_unverified`; it can be stored, but cannot enable `analytic_sha()`.

## Deterministic persistence

Every main result has a deterministic `to_dict()` record.  The BSD quotient
also has canonical JSON and a flat SQLite row:

```sage test
payload = B.to_json()
same = BSDAnalyticQuotient.from_json(payload)
assert same.to_json() == payload

row = B.sqlite_record()
print(row["curve_sha256"], row["record_sha256"])
```

For a small Sage.js-native snapshot, use SagePack:

```sage test
import os
import tempfile

packet = dumps(B.to_dict())
assert loads(packet) == B.to_dict()
with tempfile.TemporaryDirectory() as directory:
    filename = os.path.join(directory, "bsd-record")
    save(B.to_dict(), filename)
    record = load(filename)
    assert record == B.to_dict()
```

For an indexed research database, store the canonical JSON as the source of
record and duplicate only useful query columns:

```sage test
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("""
    CREATE TABLE IF NOT EXISTS bsd_results (
        record_sha256 TEXT PRIMARY KEY,
        curve_sha256  TEXT NOT NULL,
        rank          INTEGER NOT NULL,
        quotient_name TEXT NOT NULL,
        numerator     TEXT,
        denominator   TEXT,
        rigorous      INTEGER NOT NULL,
        payload_json  TEXT NOT NULL
    )
""")

row = B.sqlite_record()
db.execute(
    "INSERT OR REPLACE INTO bsd_results VALUES (?,?,?,?,?,?,?,?)",
    (
        row["record_sha256"], row["curve_sha256"], row["rank"],
        row["quotient_name"], row["quotient_numerator"],
        row["quotient_denominator"], row["rigorous"],
        row["payload_json"],
    ),
)
db.commit()
stored = db.execute(
    "SELECT payload_json FROM bsd_results WHERE record_sha256=?",
    (row["record_sha256"],),
).fetchone()
assert stored[0] == B.to_json()
db.close()
```

Unbounded integers are decimal strings in JSON, so JavaScript and SQLite
consumers do not silently lose precision.  Rehydration recomputes derived BSD
factors and rejects tampering.

## Node, browser WebAssembly, and native acceleration

The arithmetic schemas, exact lattice calculations, certificate replay, and
supplied-data quotient are ordinary Python source compiled by the same Sage.js
frontend in Node and browser workers.  A release-tier browser parity case
checks the exact rank-2 quotient and SagePack round trip.

Native FLINT, smalljac, and Arb paths are optional accelerators.  Browser
builds use receipt-authenticated WebAssembly capabilities where available and
the same-source portable implementation otherwise.  Capability failures are
part of the public result; browser code does not silently call a host Sage,
PARI, Magma, or an online service.

Current analytic periods and central derivatives remain refinement-stable
rather than fully rigorous analytic enclosures on every host.  That status is
identical in Node and WebAssembly and survives serialization.
