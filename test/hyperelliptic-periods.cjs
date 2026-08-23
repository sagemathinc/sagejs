"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const oracleCorpus = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "hyperelliptic-bsd-oracles", "corpus.json"),
    "utf8",
  ),
);
assert.equal(oracleCorpus.schema, "sagejs.hyperelliptic-bsd-oracles/v1");
assert.equal(oracleCorpus.sources[0].id, "pari-2.18.1-alpha");
assert.equal(oracleCorpus.sources[0].status, "independent-external-oracle");
const oraclePeriodRows = [
  ...oracleCorpus.pari_genus2,
  ...oracleCorpus.pari_genus3_periods,
].map(({ id, model, real_period }) => ({
  id,
  model: {
    f: model.f.map(exactRationalText),
    h: model.h.map(exactRationalText),
  },
  real_period,
}));
const oraclePeriodRowsJson = JSON.stringify(oraclePeriodRows);

function exactRationalText(value) {
  assert.equal(typeof value, "string");
  assert.match(value, /^-?(?:0|[1-9][0-9]*)(?:\/[1-9][0-9]*)?$/);
  return value;
}

const exactLoaderRegressionJson = JSON.stringify({
  f: ["900719925474099312345678901234567890", "-7/13", "1"],
  h: ["-900719925474099312345678901234567891", "5/17"],
});

test(
  "hyperelliptic periods recover the real lattice and preserve honest status",
  { timeout: 300_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
from sagejs.hyperelliptic_curves.periods import (
    HyperellipticPeriodCapabilityError,
    clear_period_cache,
    period_cache_info,
    real_period,
)
clear_period_cache()
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve((x+3)*(x+2)*(x+1)*(x-1)*(x-2))
P = real_period(C, prec=64)
assert P.genus == 2 and P.period_matrix().nrows() == 2
assert P.period_matrix().ncols() == 4 and P.siegel_matrix().nrows() == 2
assert P.real_components() == 4
assert not P.rigorous and not P.arithmetic_balls_rigorous
assert P.normalization_status == "model_normalized"
assert P.verify()["verified"] and P.diagnostics()["refinement_stable"] is not False
record = P.to_dict()
assert record["schema"] == "sagejs.hyperelliptic/real-period-v1"
assert record["root_isolation_status"].startswith("exact_QQbar_identity")
assert record["normalization"]["neron_differential_determinant"] is None

Q = real_period(C, prec=64)
assert Q.cache_hit and period_cache_info()["model_hits"] == 1
record["period_matrix"][0][0] = ("999", "999")
record["conjugation_matrix"][0][0] = 999
diagnostics = P.diagnostics()
diagnostics["refinement_runs"][0]["branch_order"] = [999]
private_model = P._model_data
private_model["model_real_period"] = "999"
private_model["period_matrix"][0][0] = ["999", "999"]
private_model["siegel_matrix"][0][0] = ["999", "999"]
assert P.verify()["verified"] and Q.verify()["verified"]
assert Q.to_dict()["period_matrix"][0][0] != ("999", "999")
assert P.to_dict()["model_real_period"] != "999"
sealed_model_rejected = False
try:
    P._model_data = private_model
except (AttributeError, TypeError):
    sealed_model_rejected = True
assert sealed_model_rejected
precision_rejected = False
try:
    P.precision_bits = 999
except (AttributeError, TypeError):
    precision_rejected = True
assert precision_rejected
N = real_period(
    C,
    prec=64,
    normalization="neron",
    neron_lattice_index=2,
    provenance={"kind": "test", "source": "supplied exact lattice index"},
)
assert abs(float(N.neron_period() / P.model_period()) - 0.5) < 1e-14
assert N.to_dict()["normalization"]["neron_lattice_index"] == 2
provenance = {"kind": "test", "nested": {"sources": ["orientation"]}}
negative = real_period(
    C,
    prec=64,
    normalization="neron",
    neron_differential_determinant=-1/2,
    provenance=provenance,
)
provenance["nested"]["sources"][0] = "poisoned"
private_normalization = negative._normalization
private_normalization["determinant_parts"] = [999, 1]
assert abs(float(negative.neron_period() / P.model_period()) - 0.5) < 1e-14
assert negative.to_dict()["normalization"]["provenance"]["nested"]["sources"][0] == "orientation"
try:
    real_period(C, prec=64, neron_differential_determinant=1, provenance={"bad": QQ(1)/2})
    raise AssertionError("non-JSON provenance was accepted")
except TypeError:
    pass
try:
    real_period(C, prec=64, normalization="neron")
    raise AssertionError("missing Neron normalization was silently accepted")
except HyperellipticPeriodCapabilityError as error:
    assert error.code == "neron_normalization_unavailable"
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);

test(
  "mixed, even, generalized, and genus-3 models pass period capability gates",
  { timeout: 300_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
from sagejs.hyperelliptic_curves.periods import real_period
R = PolynomialRing(QQ, "x")
x = R.gen()
mixed = real_period(HyperellipticCurve(x^5-x+1), prec=64)
even = real_period(HyperellipticCurve(x^6+x+1), prec=64)
f = x^5 + x^3 + 2
h = x^2 + 1
generalized_curve = HyperellipticCurve(f, h)
completed_curve = HyperellipticCurve((h^2 + 4*f)/4)
generalized = real_period(generalized_curve, prec=64)
completed = real_period(completed_curve, prec=64)
genus_three = real_period(HyperellipticCurve(x^7-x+1, x^2), prec=64)
assert mixed.real_components() == 1
assert even.genus == generalized.genus == completed.genus == 2
assert genus_three.genus == 3 and genus_three.period_matrix().ncols() == 6
assert all(item.verify()["verified"] for item in [mixed, even, generalized, completed, genus_three])
assert abs(float(generalized.model_period() - completed.model_period())) < 1e-9
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);

test(
  "Abel--Jacobi lifts reuse periods and add split rational support",
  { timeout: 300_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
from sagejs.hyperelliptic_curves.periods import abel_jacobi, real_period
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x^5-x+1)
periods = real_period(C, prec=64)
positive = C([0, 1])
negative = C([0, -1])
u = abel_jacobi(C, positive, period_result=periods, prec=64)
v = periods.abel_jacobi(negative, prec=64)
zero = abel_jacobi(C, [positive, negative], period_result=periods, prec=64)
assert u.genus == 2 and len(u.vector()) == 2
assert u.period_matrix() == periods.period_matrix()
assert u.verify()["verified"] and v.verify()["verified"] and zero.verify()["verified"]
assert max(abs(float(value.real())) + abs(float(value.imag())) for value in zero.vector()) < 1e-9
again = abel_jacobi(C, positive, period_result=periods, prec=64)
assert again.cache_hit
assert u.to_dict()["basepoint"] == "infinity"
assert not u.to_dict()["rigorous"]
record = u.to_dict()
record["vector"][0] = ("999", "999")
record["support"][0] = "poisoned"
private_data = u._data
private_data["vector"][0] = ["999", "999"]
private_data["support"][0] = "poisoned"
private_data["refinement_runs"][-1]["quadrature_panels"] = 999
assert u.verify()["verified"] and again.verify()["verified"]
assert again.to_dict()["vector"][0] != ("999", "999")
sealed_abel_rejected = False
try:
    u._data = private_data
except (AttributeError, TypeError):
    sealed_abel_rejected = True
assert sealed_abel_rejected
try:
    abel_jacobi(C, positive, period_result=periods, prec=96)
    raise AssertionError("Abel--Jacobi silently exceeded the period precision")
except Exception as error:
    assert getattr(error, "code", None) == "period_precision_too_low"
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);

test(
  "high-precision periods adapt quadrature and report achieved stability",
  { timeout: 300_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
from sagejs.hyperelliptic_curves.periods import real_period
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x^5-x+1)
periods = real_period(C, prec=160)
record = periods.to_dict()
assert periods.precision_bits == 160
assert 0 < periods.achieved_stability_bits <= record["work_precision_bits"]
assert record["achieved_stability_bits"] == periods.achieved_stability_bits
assert len(record["refinement_runs"][0]["quadrature_attempts"]) >= 1
assert periods.verify()["verified"]
point = C([0, 1])
try:
    periods.abel_jacobi(point, prec=periods.achieved_stability_bits + 1)
    raise AssertionError("Abel--Jacobi exceeded achieved period stability")
except Exception as error:
    assert getattr(error, "code", None) == "period_precision_too_low"
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);

test(
  "real periods match the versioned PARI genus-2 and genus-3 corpus",
  { timeout: 300_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
from sagejs.hyperelliptic_curves.periods import clear_period_cache, real_period
clear_period_cache()
R = PolynomialRing(QQ, "x")
# Loaded from the pinned PARI/GP 2.18.1.alpha corpus by the Node harness.
rows = ${oraclePeriodRowsJson}
field = RealField(64)
def exact_rational(text):
    pieces = text.split("/")
    if len(pieces) == 1:
        return QQ(int(pieces[0]))
    return QQ(int(pieces[0])) / QQ(int(pieces[1]))
for row in rows:
    identifier = row["id"]
    curve = HyperellipticCurve(
        R([exact_rational(value) for value in row["model"]["f"]]),
        R([exact_rational(value) for value in row["model"]["h"]]),
    )
    periods = real_period(curve, prec=64)
    expected = field(row["real_period"])
    relative_error = abs(periods.model_period() - expected) / expected
    assert relative_error < field("1e-15"), (identifier, relative_error)
    assert periods.verify()["verified"], identifier
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);

test("period oracle loader preserves large and rational coefficients exactly", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(String.raw`
row = ${exactLoaderRegressionJson}
def exact_rational(text):
    pieces = text.split("/")
    if len(pieces) == 1:
        return QQ(int(pieces[0]))
    return QQ(int(pieces[0])) / QQ(int(pieces[1]))
f = [exact_rational(value) for value in row["f"]]
h = [exact_rational(value) for value in row["h"]]
assert f[0] == 900719925474099312345678901234567890
assert f[1] == -7/13 and h[1] == 5/17
assert h[0] == -900719925474099312345678901234567891
True
`);
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});
