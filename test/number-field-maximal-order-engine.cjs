"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

const root = join(__dirname, "..");

test("the public maximal-order path is lazy, certified, and cache-safe", async () => {
  const source = readFileSync(
    join(root, "src", "baselib", "number_fields.py"),
    "utf8",
  );
  const method = source.slice(
    source.indexOf("    def maximal_order("),
    source.indexOf("    ring_of_integers = maximal_order"),
  );
  assert.doesNotMatch(method, /sage\.factor/);

  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R.<x> = QQ[]",
        "K.<a> = NumberField(x^3 + x^2 - 2*x + 8)",
        "local = K.maximal_order([2])",
        "global_order = K.maximal_order()",
        "bad = dict(global_order.maximality_certificate())",
        "bad['order_discriminant'] = bad['order_discriminant'] + 1",
        "from sagejs.number_fields.maximal_order_certification import check_certificate",
        "bad_check = check_certificate(bad)",
        "assumption_error = False",
        "try:",
        "    K.maximal_order(2, assume_maximal=True)",
        "except ValueError:",
        "    assumption_error = True",
        "[local.is_maximal(), global_order.is_maximal(), global_order is K.ring_of_integers(), local is global_order, global_order.maximality_certificate()['certified'], bad_check['certified'], assumption_error]",
      ].join("\n"),
    );
    assert.equal(result.repr, "[False, True, True, False, True, False, True]");
  } finally {
    await session.close();
  }
});

test("T(8,2^32) avoids full factorization through the public API", async () => {
  const session = await createSage();
  try {
    const started = performance.now();
    const result = await session.evaluate(
      [
        "R.<x> = QQ[]",
        "coefficients = [463168356949264781694283940034751631413079938662562256157830336031652518559742, -68719476736, -737869762948382064640, -2535301200456458802993406410752, -1361129467683753853853498429727072845824, 0, 0, 0, 1]",
        "K.<a> = NumberField(R(coefficients))",
        "O = K.maximal_order(trace=True)",
        "certificate = O.maximality_certificate()",
        "events = O.maximal_order_trace()['events']",
        "[O.discriminant(), O.is_maximal(), len(O.basis()), certificate['index'], [event['stage'] for event in events], events[2]['details']['merged_composite_lattice']]",
      ].join("\n"),
    );
    const elapsed = performance.now() - started;
    assert.match(
      result.repr,
      /^\[-2147483648, True, 8, 3179557053031851899185109992371205233166102563054994659612778573877352351101815706666153685320008306418583370978265859646929314209130671444551656380504174391180190567870975750525148778143146969696718736142491176896345575184876739493887, /,
    );
    assert.match(result.repr, /'composite-local-order'/);
    assert.match(result.repr, /'native-local-orders'/);
    assert.match(result.repr, /'global-certification'/);
    assert.match(result.repr, /, True\]$/);
    assert.ok(elapsed < 20_000, `catastrophic public case took ${elapsed}ms`);
  } finally {
    await session.close();
  }
});
