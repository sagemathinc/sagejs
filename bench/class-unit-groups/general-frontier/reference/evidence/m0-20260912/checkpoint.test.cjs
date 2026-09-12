// Offline consistency of the published checkpoint, not raw replay or a proof.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function check(s) {
  assert.equal(s.schema, 'sagejs.m0-reference-checkpoint.v1');
  assert.equal(s.M0_complete, false);
  assert.equal(s.general_competitiveness_established, false);
  assert.equal(s.optimization_campaigns_started, 0);
  assert.deepEqual(s.frozen_populations, {coverage: 1800, performance: 360, smoke: 90});
  assert.equal(s.historical.paired_fields, 360);
  assert.deepEqual(s.historical.recovered_partition, [319, 24, 17]);
  assert.deepEqual(s.historical.faster_cost_bands, {below_1s: 208, from_1_to_10s: 106, from_10_to_60s: 46});
  assert.equal(s.historical.at_least_one_second, 152);
  assert.equal(s.historical.at_least_ten_seconds, 46);
  assert.equal(s.historical.current_timing_qualification, false);
  assert.equal(s.historical.failed_attempts_preserved, true);
  assert.equal(s.unconditional.fields, 90);
  assert.equal(s.unconditional.retained_reference_outputs, 180);
  assert.equal(s.unconditional.exact_summary_pairs_agree, true);
  assert.equal(s.unconditional.independent_completeness_replay, false);
  assert.equal(s.unconditional.Sagejs_qualified, false);
  assert.equal(s.repeats.selected_fields, 14);
  assert.equal(s.repeats.declared_samples, 14 * 2 * 2 * 3);
  assert(Number.isInteger(s.repeats.eligible_samples));
  assert(s.repeats.eligible_samples >= 0 && s.repeats.eligible_samples <= 168);
  assert.equal(s.repeats.eligible_samples + Object.values(s.repeats.rejections).reduce((a,b) => a+b, 0), 168);
  assert.equal(s.repeats.remaining_full_panel_fields, 346);
  assert.equal(s.repeats.independent_replay, false);
  assert.equal(s.repeats.regulator_guarantees_equivalent, false);
  assert.equal(s.repeats.warm_jit_qualification, false);
  assert.equal(s.repeats.runtime_inventory_unchanged, true);
  assert.equal(s.repeats.services_closed, true);
  assert.equal(s.repeats.pending_ledger_reservation, null);
  assert.equal(s.failed_repeat_v2.pending_reservation_charged_seconds, 610);
  assert.equal(s.failed_repeat_v2.status, 'infrastructure-aborted-incomplete');
  assert.equal(s.stress.preselected_presentations, 90);
  assert.equal(s.stress.sentinels, 18);
  assert.equal(s.stress.generated_presentations, 38);
  assert.equal(s.stress.final_stress_qualification, false);
  assert.equal(s.stress.order_fixture_processes, 6);
  assert.equal(s.stress.order_diagnostic_processes, 76);
  assert.deepEqual(s.stress.order_diagnostic_status_counts, {ok: 76});
  assert.equal(s.stress.paired_reference_maximal_orders, 38);
  assert.equal(s.stress.exact_order_consistency_replayed, true);
  assert.equal(s.stress.independent_maximality_replay, false);
  assert.equal(s.stress.distinct_field_admission, false);
  assert.deepEqual(s.old_Sagejs_smoke, {complete: 0, capability_gap: 28, incomplete: 40, timeout: 14, OOM: 2, request_error: 6});
  assert.equal(Object.values(s.old_Sagejs_smoke).reduce((a,b) => a+b, 0), 90);
  assert.equal(s.budget.M0_active_hour_limit, 56);
  assert.equal(s.budget.M0_CPU_second_limit, 432000);
  assert(Number.isFinite(s.budget.M0_active_hours) && s.budget.M0_active_hours <= 56);
  assert(Number.isFinite(s.budget.last_closed_M0_CPU_seconds) && s.budget.last_closed_M0_CPU_seconds <= 432000);
  assert(s.pins.length >= 8);
  assert.equal(new Set(s.pins.map(p => p.artifact)).size, s.pins.length);
  for (const pin of s.pins) {
    assert.equal(typeof pin.artifact, 'string');
    assert.match(pin.sha256, /^[0-9a-f]{64}$/);
  }
}

const summary = JSON.parse(fs.readFileSync(path.join(__dirname, 'checkpoint.json'), 'utf8'));
check(summary);
for (const mutate of [
  s => { s.M0_complete = true; },
  s => { s.repeats.eligible_samples = 169; },
  s => { s.repeats.remaining_full_panel_fields = 0; },
  s => { s.repeats.regulator_guarantees_equivalent = true; },
  s => { s.unconditional.independent_completeness_replay = true; },
  s => { s.historical.failed_attempts_preserved = false; },
  s => { s.budget.M0_CPU_second_limit = 500000; },
  s => { s.old_Sagejs_smoke.complete = 1; },
  s => { s.pins[0].sha256 = 'unknown'; },
  s => { s.stress.independent_maximality_replay = true; },
  s => { s.stress.distinct_field_admission = true; },
]) {
  const changed = structuredClone(summary);
  mutate(changed);
  assert.throws(() => check(changed));
}
console.log('M0 checkpoint consistency and eleven claim/budget mutations pass (not independent raw or mathematical replay).');
