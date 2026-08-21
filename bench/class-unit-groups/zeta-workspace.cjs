#!/usr/bin/env node

"use strict";

const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { hostname, tmpdir } = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..", "..");
const executable =
  process.env.SAGEJS_BENCH_EXECUTABLE || join(root, "bin", "sagejs");
const source = String.raw`
import hashlib
import json
import time

from sagejs.number_fields.class_unit_analytic import (
    RationalEndpoint,
    ZetaLogResidueWorkspace,
)


def elapsed(started):
    return (time.perf_counter_ns() - started) / 1_000_000_000


R = PolynomialRing(QQ, "x")
x = R.gen()
field_started = time.perf_counter_ns()
K = NumberField(x**5 + x**3 - x**2 + 4*x + 1, "a")
order = K.maximal_order()
field_seconds = elapsed(field_started)

probe = ZetaLogResidueWorkspace(
    int(order.discriminant()), int(K.degree()), order.splitting_records
)
started = time.perf_counter_ns()
threshold, tail, evaluations = probe.threshold(
    RationalEndpoint(1, 16), 128, 1_000_000
)
threshold_seconds = elapsed(started)
started = time.perf_counter_ns()
primes = probe.rational_primes_below(threshold)
prime_seconds = elapsed(started)


def one_workspace(block_size):
    workspace = ZetaLogResidueWorkspace(
        int(order.discriminant()), int(K.degree()), order.splitting_records
    )
    started = time.perf_counter_ns()
    splitting = workspace.splitting_types(primes, block_size)
    splitting_seconds = elapsed(started)
    started = time.perf_counter_ns()
    plan = workspace.prime_power_plan(threshold, splitting)
    plan_seconds = elapsed(started)
    started = time.perf_counter_ns()
    finite, interval_diagnostics = workspace.finite_term(plan, 128)
    finite_seconds = elapsed(started)
    splitting_payload = [
        [prime, [[e, f] for e, f in splitting[prime]]]
        for prime in sorted(splitting)
    ]
    finite_payload = finite.to_dict()
    finite_source = finite_payload.pop("source")
    return {
        "block_size": block_size,
        "splitting_seconds": splitting_seconds,
        "plan_seconds": plan_seconds,
        "finite_seconds": finite_seconds,
        "provider_calls": workspace.provider_calls,
        "records_decoded": workspace.records_decoded,
        "raw_terms": plan.raw_terms,
        "aggregated_terms": plan.aggregated_terms,
        "finite_term": finite_payload,
        "finite_source_bytes": len(finite_source.encode("ascii")),
        "finite_source_sha256": hashlib.sha256(
            finite_source.encode("ascii")
        ).hexdigest(),
        "tail_bound": tail.to_dict(),
        "interval_diagnostics": interval_diagnostics,
        "splitting_payload": splitting_payload,
    }


current = one_workspace(4096)
wide = one_workspace(65_536)
assert current["splitting_payload"] == wide["splitting_payload"]
assert current["finite_term"] == wide["finite_term"]
assert current["finite_source_sha256"] == wide["finite_source_sha256"]
assert current["tail_bound"] == wide["tail_bound"]
splitting_sha256 = hashlib.sha256(
    json.dumps(
        current["splitting_payload"], separators=(",", ":")
    ).encode("ascii")
).hexdigest()
del current["splitting_payload"]
del wide["splitting_payload"]
print(json.dumps({
    "field_seconds": field_seconds,
    "discriminant": int(order.discriminant()),
    "degree": int(K.degree()),
    "threshold": threshold,
    "threshold_evaluations": evaluations,
    "threshold_seconds": threshold_seconds,
    "prime_count": len(primes),
    "prime_enumeration_seconds": prime_seconds,
    "splitting_sha256": splitting_sha256,
    "current": current,
    "wide": wide,
    "exact_interval_equivalence": True,
}, sort_keys=True))
`;

const directory = mkdtempSync(join(tmpdir(), "sagejs-zeta-workspace-"));
try {
  const filename = join(directory, "benchmark.py");
  writeFileSync(filename, source, "utf8");
  const started = process.hrtime.bigint();
  const result = spawnSync(executable, ["--python", filename], {
    cwd: root,
    encoding: "utf8",
    timeout: 3 * 60 * 1000,
  });
  const wallSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
  const payload = JSON.parse(result.stdout.trim());
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  console.log(
    JSON.stringify({
      benchmark: "class-unit-zeta-workspace-quintic",
      host: hostname(),
      wall_seconds: wallSeconds,
      result_sha256: digest,
      result: payload,
    }),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
