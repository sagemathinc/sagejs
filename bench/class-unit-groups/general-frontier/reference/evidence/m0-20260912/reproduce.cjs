// Summarize existing campaign archive records. Does not run CAS or mutate inputs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
assert.equal(process.argv.length, 3, 'Pass the backed-up build/general-frontier archive directory');
const archive = path.resolve(process.argv[2]);
const pins = [];
function read(name, expected) {
  const raw = fs.readFileSync(path.join(archive, name));
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  if (expected) assert.equal(sha256, expected, name);
  pins.push({artifact: name, sha256});
  return JSON.parse(raw);
}
const historical = read('performance-historical360-v1/reconciliation.json', '0a01a57e6a767adbbc917b7a730c46df0fa921849b31079f8889b961c3936d3d');
const costs = read('performance-historical360-v1/repeat-cost-planning-v5.json', '279377571724af5d3a1b6a8a4c662ff710c077d3f510789e021d0b25dcd41ec8');
const unconditional = read('unconditional-remainder-dispatch-v1/closure.json');
assert.equal(unconditional.validated_results_sha256, '2eadaca67a34cd6a28842875b01f62f04b44a133104a58496a1ae29681fa2c03');
assert.equal(unconditional.paired_reference_proof_screened, 90);
read('unconditional-remainder-dispatch-v1/validated-results.json', unconditional.validated_results_sha256);
const repeated = read('reference-repeat-rank-two-v3/closure.json');
const report = read('reference-repeat-rank-two-v3/report-final.json', repeated.report_sha256);
assert.equal(repeated.plan_sha256, 'f6581624815cdfe80c897a57eaa3ef688112aa946fc9339811d8e78bae80cd51');
assert.equal(repeated.pending, null);
const failed = read('reference-repeat-rank-two-v2/aborted-closure.json');
const stress = read('stress-preselection-v1/selection.json', 'b31777994c5768fcf18bb9453f10fe80c2b0dd8071e3a6382fbb681e4a8da131');
const effort = read('effort-checkpoint-20260912T2023Z.json');
const orderFixture = read('stress-identity-preparation-v1/fixture-closure-verified.json', '45476e9c1633f7aa032cc8acdee07a7f5ef12d5f40417afd3b9da7196c86c0b0');
const orderDiagnostic = read('stress-identity-preparation-v1/stress38-closure.json');
assert.equal(orderFixture.processes, 6);
assert.equal(orderDiagnostic.declared_processes, 76);
assert.equal(orderDiagnostic.qualification_evidence, false);
assert.equal(orderDiagnostic.independent_maximality_replay, false);
assert.equal(orderDiagnostic.pending, null);
const smokeBytes = fs.readFileSync(path.resolve(__dirname, '../../runner/smoke90-final-accounting.json'));
pins.push({artifact: 'repository:reference/runner/smoke90-final-accounting.json', sha256: crypto.createHash('sha256').update(smokeBytes).digest('hex')});
const smoke = JSON.parse(smokeBytes);
assert.equal(smoke.count, 90);
assert.equal(smoke.terminal_accounting_complete, true);
assert.equal(smoke.performance_qualified, false);
const smokeCounts = {};
for (const row of smoke.requests) smokeCounts[row.status] = (smokeCounts[row.status] || 0) + 1;
assert.equal(historical.historical_pairs, 360);
assert.equal(historical.qualification_evidence, false);
assert.equal(historical.claimed_counts_match, true);
assert.equal(costs.dispatch_authorized, false);
assert.equal(unconditional.exact_summary_agreement, true);
assert.equal(unconditional.independent_replay, false);
assert.equal(repeated.runtime_byte_identical_before_after, true);
assert.equal(repeated.independent_replay, false);
assert.equal(report.runs.length, 4);
assert(report.runs.every(run => run.status === 'reviewed'));
assert.equal(stress.selection_uses_sagejs_results, false);
assert.equal(stress.primary_candidates.length, 90);
assert.equal(stress.sentinel_candidates.length, 18);
const d = historical.distributions;
console.log(JSON.stringify({
  schema: 'sagejs.m0-reference-checkpoint.v1',
  M0_complete: false, general_competitiveness_established: false,
  optimization_campaigns_started: 0,
  frozen_populations: {coverage: 1800, performance: 360, smoke: 90},
  historical: {
    paired_fields: historical.historical_pairs, recovered_partition: [319, 24, 17],
    faster_cost_bands: {below_1s: d.faster_below_1s, from_1_to_10s: d.faster_1_to_10s, from_10_to_60s: d.faster_10_to_60s},
    at_least_one_second: historical.observed_at_least_one_second,
    at_least_ten_seconds: historical.observed_at_least_ten_seconds,
    current_timing_qualification: false, failed_attempts_preserved: true,
    proposed_worker_hours: costs.estimated_worker_hours, estimate_is_admission: false,
  },
  unconditional: {
    fields: unconditional.paired_reference_proof_screened, retained_reference_outputs: 180,
    exact_summary_pairs_agree: unconditional.exact_summary_agreement,
    independent_completeness_replay: false, Sagejs_qualified: false,
  },
  repeats: {
    selected_fields: repeated.declared_fields, declared_samples: repeated.declared_samples,
    eligible_samples: repeated.eligible_samples, rejections: repeated.rejections,
    exact_summary_panel: repeated.exact_summary_panel,
    remaining_full_panel_fields: repeated.full_panel_remaining_fields,
    independent_replay: false, regulator_guarantees_equivalent: false,
    warm_jit_qualification: false, runtime_inventory_unchanged: true,
    services_closed: true, pending_ledger_reservation: null,
  },
  failed_repeat_v2: {status: failed.status, pending_reservation_charged_seconds: 610},
  stress: {
    preselected_presentations: 90, sentinels: 18,
    generated_presentations: stress.primary_candidates.filter(r => r.field_discriminant === null).length,
    final_stress_qualification: false,
    order_fixture_processes: orderFixture.processes,
    order_diagnostic_processes: orderDiagnostic.declared_processes,
    order_diagnostic_status_counts: orderDiagnostic.status_counts,
    paired_reference_maximal_orders: orderDiagnostic.paired_reference_maximality,
    exact_order_consistency_replayed: orderDiagnostic.exact_consistency_replay,
    independent_maximality_replay: false,
    distinct_field_admission: false,
    identity_status_at_this_checkpoint: 'order-only diagnostic closed; distinct-field and stress-cost admission remain separate',
  },
  old_Sagejs_smoke: {
    complete: smokeCounts.complete || 0, capability_gap: smokeCounts['capability-gap'] || 0,
    incomplete: smokeCounts['incomplete-computation'] || 0, timeout: smokeCounts.timeout || 0,
    OOM: smokeCounts['resource-oom'] || 0, request_error: smokeCounts['request-error'] || 0,
  },
  budget: {
    active_hours_as_of_utc: effort.as_of_utc,
    M0_active_hours: effort.M0_active_agent_hours,
    M0_active_hour_limit: effort.M0_active_agent_hour_limit,
    last_closed_M0_CPU_seconds: orderDiagnostic.charged_seconds,
    M0_CPU_second_limit: effort.M0_limit_seconds,
  },
  pins,
  archive_scope: 'Raw receipts and original reproducers are retained in backed-up campaign storage, not bundled by this compact checkpoint. This summary is not independent raw or mathematical replay.',
}, null, 2));
