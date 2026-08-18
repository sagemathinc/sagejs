"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const referenceTimeout = 120_000;

test("split-Mellin reference values agree with raw and completed oracles", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        'M = __import__("sagejs.elliptic_curves.lseries", fromlist=["lseries_values"])',
        "from mpmath import mp",
        "E = EllipticCurve([0,-1,1,-10,-20])",
        'R = M.lseries_values(E, [["1","1"]], E.root_number(), 80, algorithm="reference")',
        'v = R["values"][0]',
        'raw = mp.mpc(v["raw_real"], v["raw_imag"])',
        'completed = mp.mpc(v["completed_real"], v["completed_imag"])',
        'raw_oracle = mp.mpc("0.25232984431224526635169521524253052213039815390537", "0.34591234236210700213618597723917769201609936620194")',
        'completed_oracle = mp.mpc("0.11787882421801923914880007480552830202619787111043", "0")',
        '[abs(raw-raw_oracle) < mp.mpf("1e-24"),',
        ' abs(completed-completed_oracle) < mp.mpf("1e-24"),',
        ' R["refinement_stable"], not R["rigorous"],',
        ' R["analytic_error_status"] == "coefficient_grid_and_upper_omission_only",',
        ' R["coefficient_horner"] == "arbitrary precision"]',
      ].join("\n"),
      { timeout: referenceTimeout },
    );
    assert.equal(result.repr, "[True, True, True, True, True, True]");
  } finally {
    await session.close();
  }
});

test("Sage.js quadrature agrees with the independent incomplete-gamma sum", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        'M = __import__("sagejs.elliptic_curves.lseries", fromlist=["reference_lseries_values"])',
        "from mpmath import mp",
        "E = EllipticCurve([0,-1,1,-10,-20])",
        'R = M.reference_lseries_values(E, [["1","1"]], 1, 80)',
        'G = M.reference_incomplete_gamma_value(E.anlist(120), 11, 1, ["1","1"], 128)',
        'v = R["values"][0]',
        'raw = mp.mpc(v["raw_real"], v["raw_imag"])',
        'gamma_raw = mp.mpc(G["raw_real"], G["raw_imag"])',
        'completed = mp.mpc(v["completed_real"], v["completed_imag"])',
        'gamma_completed = mp.mpc(G["completed_real"], G["completed_imag"])',
        '[abs(raw-gamma_raw) < mp.power(2,-90),',
        ' abs(completed-gamma_completed) < mp.power(2,-90),',
        ' R["quadrature_rule_order"] == 16,',
        ' int(R["refinement_runs"][1]["precision_bits"]) == 112]',
      ].join("\n"),
      { timeout: referenceTimeout },
    );
    assert.equal(result.repr, "[True, True, True, True]");
  } finally {
    await session.close();
  }
});

test("512-bit GL64 reference retains accuracy beyond the old GL16 floor", () => {
  const modulePath = join(
    __dirname,
    "..",
    "src",
    "lib",
    "sagejs",
    "elliptic_curves",
    "lseries.py",
  );
  const mpmathDirectory = join(__dirname, "..", "src", "lib", "mpmath");
  const mpmathPath = join(mpmathDirectory, "__init__.py");
  const source = [
    "import importlib.util, sys",
    `mpmath_path = ${JSON.stringify(mpmathPath)}`,
    `mpmath_directory = ${JSON.stringify(mpmathDirectory)}`,
    "mpmath_spec = importlib.util.spec_from_file_location('mpmath', mpmath_path, submodule_search_locations=[mpmath_directory])",
    "mpmath_module = importlib.util.module_from_spec(mpmath_spec)",
    "sys.modules['mpmath'] = mpmath_module",
    "mpmath_spec.loader.exec_module(mpmath_module)",
    `path = ${JSON.stringify(modulePath)}`,
    "spec = importlib.util.spec_from_file_location('lseries_reference_test', path)",
    "module = importlib.util.module_from_spec(spec)",
    "sys.modules['lseries_reference_test'] = module",
    "spec.loader.exec_module(module)",
    "from mpmath import mp",
    "base = [0,1,-2,-1,2,1,2,-2,0,-2,-2,1,-2,4,4,-1,-4,-2,4,0,2,2,-2,-1,0,-4,-8,5,-4,0,2,7,8,-1,4,-2,-4,3,0,-4,0,-8,-4,-6,2,-2,2,8,4,-3,8,2,8,-6,-10,1]",
    "coefficients = base + [0]*500",
    "class FiniteCoefficientCurve:",
    "    def conductor(self): return 11",
    "    def anlist(self, cutoff): return coefficients[:cutoff+1]",
    "result = module.reference_lseries_values(FiniteCoefficientCurve(), [['1','1']], 1, 512)",
    "gamma = module.reference_incomplete_gamma_value(coefficients, 11, 1, ['1','1'], 576)",
    "value = result['values'][0]",
    "raw = mp.mpc(value['raw_real'], value['raw_imag'])",
    "gamma_raw = mp.mpc(gamma['raw_real'], gamma['raw_imag'])",
    "assert abs(raw-gamma_raw) < mp.power(2,-520)",
    "assert result['quadrature_rule_order'] == 64",
    "assert result['refinement_runs'][1]['precision_bits'] == 544",
    "result200 = module.reference_lseries_values(FiniteCoefficientCurve(), [['1','10']], 1, 200)",
    "gamma200 = module.reference_incomplete_gamma_value(coefficients, 11, 1, ['1','10'], 256)",
    "value200 = result200['values'][0]",
    "raw200 = mp.mpc(value200['raw_real'], value200['raw_imag'])",
    "gamma_raw200 = mp.mpc(gamma200['raw_real'], gamma200['raw_imag'])",
    "assert abs(raw200-gamma_raw200) < mp.power(2,-210)",
    "assert result200['quadrature_rule_order'] == 64",
    "print('ok')",
  ].join("\n");
  const python = spawnSync("python3", ["-c", source], {
    encoding: "utf8",
    timeout: referenceTimeout,
  });
  assert.equal(python.status, 0, python.stderr);
  assert.equal(python.stdout.trim(), "ok");
});

test("functional equation, conjugation, and trivial zeros survive batching", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        'M = __import__("sagejs.elliptic_curves.lseries", fromlist=["reference_lseries_values"])',
        "from mpmath import mp",
        "E = EllipticCurve([0,0,1,-1,0])",
        'P = [["1","1"],["1","-1"],["0.5","1"],["1.5","-1"],["1","0"],["-1","0"],["-0.99999904632568359375","0"]]',
        "R = M.reference_lseries_values(E, P, -1, 80)",
        "V = R['values']",
        'raw = [mp.mpc(v["raw_real"],v["raw_imag"]) for v in V]',
        'completed = [mp.mpc(v["completed_real"],v["completed_imag"]) for v in V]',
        '[abs(raw[1]-mp.conj(raw[0])) < mp.mpf("1e-23"),',
        ' abs(completed[2]+completed[3]) < mp.mpf("1e-23"),',
        " raw[4] == 0, raw[5] == 0, abs(raw[6]) > mp.mpf('1e-12'),",
        " len(V) == len(P), R['point_diagnostics'][0]['rigorous'] == False]",
      ].join("\n"),
      { timeout: referenceTimeout },
    );
    assert.equal(result.repr, "[True, True, True, True, True, True, True]");
  } finally {
    await session.close();
  }
});

test("dispatcher retries native coefficients and preserves per-point errors", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        'M = __import__("sagejs.elliptic_curves.lseries", fromlist=["lseries_values"])',
        "class MockCurve:",
        "    def __init__(self): self.calls = 0",
        "    def conductor(self): return 11",
        "    def anlist(self, cutoff): return [0,1,-2,-1][:cutoff+1]",
        "    def _lseries_values_native(self, coefficients, points, precision):",
        "        self.calls += 1",
        "        if len(coefficients) < 4:",
        "            return {'status':'insufficient_coefficients','required_cutoff':3}",
        "        value = {",
        "          'raw_real':'0.25', 'raw_imag':'0.5',",
        "          'completed_real':'1.25', 'completed_imag':'0',",
        "          'raw_real_radius':'1e-100', 'raw_imag_radius':'1e-100',",
        "          'completed_real_radius':'1e-100', 'completed_imag_radius':'1e-100',",
        "          'raw_accuracy_bits':precision+20, 'completed_accuracy_bits':precision+20,",
        "          'coefficient_tail_bound':'1e-92', 'grid_omission_bound':'2e-92',",
        "          'outer_tail_bound':'3e-92', 'analytic_error_bound':'6e-92',",
        "          'raw_conversion_magnitude':'4', 'known_error_target_met':True}",
        "        return {'status':'ok','known_error_target_met':True,'precision_bits':precision,",
        "          'work_precision_bits':precision+40,'cutoff':3,'required_cutoff':3,",
        "          'grid_points':12,'coefficient_terms':20,'values':[value]} ",
        "E = MockCurve()",
        'R = M.lseries_values(E, [["1","1"]], 1, 53, algorithm="native")',
        "[R['algorithm'] == 'native', R['coefficient_prefix_extensions'] == 1,",
        " E.calls == 3, R['point_diagnostics'][0]['raw_accuracy_bits'] == 105,",
        " R['analytic_error_bound'] != '0',",
        " R['conversion_amplification_bound'] == '4.0', R['refinement_stable']]",
      ].join("\n"),
      { timeout: 30_000 },
    );
    assert.equal(result.repr, "[True, True, True, True, True, True, True]");
  } finally {
    await session.close();
  }
});

test("planning rejects excessive work before asking for coefficients", async () => {
  const session = await createSage();
  try {
    await assert.rejects(
      session.evaluate(
        [
          'M = __import__("sagejs.elliptic_curves.lseries", fromlist=["plan_reference_lseries"])',
          'M.plan_reference_lseries(11, [["1","101"]], 53)',
        ].join("\n"),
      ),
      /moderate-height limit/,
    );
    await assert.rejects(
      session.evaluate(
        [
          'M = __import__("sagejs.elliptic_curves.lseries", fromlist=["plan_reference_lseries"])',
          'M.plan_reference_lseries(11, [["1","0"]], 20)',
        ].join("\n"),
      ),
      /precision must be at least 32 bits/,
    );
  } finally {
    await session.close();
  }
});
