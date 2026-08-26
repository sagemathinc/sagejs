// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("genus-2 local data derives exact invariants with bounded cache growth", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^5+x+1)",
            "events = []",
            "def progress(event, details):",
            "    events.append((event, details.get('prime')))",
            "rows = list(C.local_data(",
            "    2, 13, chunk_size=3, extension_degrees=2,",
            "    cache_size=2, progress=progress))",
            "summary = [(r.prime, r.status, r.backend, r.jacobian_order,",
            "            r.twist_order, r.curve_point_counts, r.p_rank,",
            "            r.ordinary, r['available']) for r in rows]",
            "(summary, len(C._local_lpolynomial_cache),",
            " len([event for event,_prime in events if event == 'record']),",
            " len([event for event,_prime in events if event == 'batch_start']),",
            " rows[4].lpolynomial == C.local_lpolynomial(11))",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "([(2, 'omitted', 'exhaustive', None, None, {}, None, None, False), " +
        "(3, 'omitted', 'exhaustive', None, None, {}, None, None, False), " +
        "(5, 'exact', 'exhaustive', 36, 36, {1: 6, 2: 46}, 0, False, True), " +
        "(7, 'omitted', 'exhaustive', None, None, {}, None, None, False), " +
        "(11, 'exact', 'exhaustive', 88, 184, {1: 8, 2: 134}, 2, True, True), " +
        "(13, 'exact', 'exhaustive', 188, 160, {1: 15, 2: 177}, 2, True, True)], " +
        "2, 6, 0, True)",
    );
  } finally {
    await session.close();
  }
});

test("genus-3 local data retains exact proof summaries and explicit fallback rows", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^7+x+1)",
            "rows = list(C.local_data(",
            "    5, 11, algorithm='rforest', chunk_size=2,",
            "    extension_degrees=(1,2), include_certificates=True))",
            "summary = [(r.prime, r.status, r.backend, r.coefficients,",
            "            r.jacobian_order, r.twist_order, r.curve_point_counts,",
            "            r.p_rank, r.certificate_summary['status'],",
            "            r.full_certificate is not None,",
            "            all(value >= 0 for value in r.timings.values()))",
            "           for r in rows]",
            "(summary, len(C._local_lpolynomial_cache))",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "([(5, 'unique', 'rforest', (1, 3, 9, 17, 45, 75, 125), " +
        "275, 85, {1: 9, 2: 35}, 3, 'unique', True, True), " +
        "(7, 'fallback', 'exhaustive', (1, 0, 21, 0, 147, 0, 343), " +
        "512, 512, {1: 8, 2: 92}, 0, 'fallback', False, True), " +
        "(11, 'omitted', 'rforest', None, None, None, {}, None, " +
        "'omitted', False, True)], 0)",
    );
  } finally {
    await session.close();
  }
});

test("canonical JSONL export cancels, resumes, verifies, and preserves exact integers", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-local-data-"));
  const resumedPath = join(directory, "resumed.jsonl");
  const freshPath = join(directory, "fresh.jsonl");
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.local_data import (",
        "    LOCAL_DATA_SCHEMA, LocalDataRecord, iter_local_data_jsonl,",
        "    local_data_jsonl_header, _record_payload, _record_from_payload)",
        "R = PolynomialRing(QQ, 'x')",
        "x = R.gen()",
        "C = HyperellipticCurve(x^7+x+1)",
        "state = {'records': 0}",
        "def progress(event, _details):",
        "    if event == 'record':",
        "        state['records'] += 1",
        "def cancel():",
        "    return state['records'] >= 2",
        `resumed_path = ${JSON.stringify(resumedPath)}`,
        `fresh_path = ${JSON.stringify(freshPath)}`,
        "first = C.local_data(",
        "    5, 13, algorithm='rforest', chunk_size=2, extension_degrees=2,",
        "    include_certificates=True, progress=progress, cancel=cancel",
        ").export_jsonl(resumed_path, include_certificates=True)",
        "second = C.local_data(",
        "    5, 13, algorithm='rforest', chunk_size=2, extension_degrees=2,",
        "    include_certificates=True",
        ").export_jsonl(resumed_path, resume=True, include_certificates=True)",
        "fresh = C.local_data(",
        "    5, 13, algorithm='rforest', chunk_size=2, extension_degrees=2,",
        "    include_certificates=True",
        ").export_jsonl(fresh_path, include_certificates=True)",
        "records = list(iter_local_data_jsonl(resumed_path))",
        "before = open(resumed_path, 'rb').read()",
        "with open(resumed_path, 'a') as output:",
        "    output.write('{partial')",
        "third = C.local_data(",
        "    5, 13, algorithm='rforest', chunk_size=2, extension_degrees=2,",
        "    include_certificates=True",
        ").export_jsonl(resumed_path, resume=True, include_certificates=True)",
        "after = open(resumed_path, 'rb').read()",
        "p = 1000003",
        "large = LocalDataRecord(",
        "    p, 3, (1,0,0,0,0,0,p^3), status='exact',",
        "    selected_algorithm='exhaustive', backend='exhaustive')",
        "large_payload = _record_payload(",
        "    large, include_timings=False, include_certificates=False)",
        "large_roundtrip = _record_from_payload(large_payload)",
        "try:",
        "    C.local_data(5,13,algorithm='rforest',chunk_size=3,",
        "                 extension_degrees=2,include_certificates=True",
        "    ).export_jsonl(resumed_path,resume=True,include_certificates=True)",
        "except Exception as error:",
        "    mismatch = (type(error).__name__, str(error))",
        "(first['status'], first['last_prime'], first['next_prime'],",
        " second['status'], second['records_total'], third['records_written'],",
        " fresh['records_total'], before == after,",
        " [(r.prime,r.status,r.jacobian_order) for r in records],",
        " records[0].full_certificate['candidate'],",
        " records[0].full_certificate['jacobian']['certificates'][0]",
        "     ['divisor']['type'],",
        " local_data_jsonl_header(resumed_path)['schema'] == LOCAL_DATA_SCHEMA,",
        " large_payload['coefficients_ascending'][-1] == str(p^3)",
        "     and large_roundtrip.coefficients[-1] == p^3",
        "     and large_roundtrip.jacobian_order > 2^53,",
        " mismatch)",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(
      result.repr,
      "('cancelled', 7, 11, 'complete', 4, 0, 4, True, " +
        "[(5, 'unique', 275), (7, 'fallback', 512), " +
        "(11, 'omitted', None), (13, 'unique', 4140)], " +
        "(3, 9, 17), 'mumford_divisor', True, True, " +
        "('ValueError', " +
        "'the local-data checkpoint belongs to a different request'))",
    );
    const resumed = readFileSync(resumedPath);
    assert.deepEqual(resumed, readFileSync(freshPath));
    assert.equal(
      createHash("sha256").update(resumed).digest("hex"),
      "83c6d2c855d63e2eb89a740d47c3cf81d4faf144e39dca29af2e38bf93627cbc",
    );
  } finally {
    await session.close();
    rmSync(directory, { recursive: true });
  }
});
