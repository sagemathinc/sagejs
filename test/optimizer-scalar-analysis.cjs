// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const analysis = require(
  "../dist/tools/python/optimizer/analyses/scalar-program.js",
);
const { affineTarget } = require(
  "../dist/tools/python/optimizer/analyses/scalar-affine.js",
);
const target = require(
  "../dist/tools/python/optimizer/targets/v8-scalar-cost.js",
);

const slot = (index) => ({ kind: "slot", slot: index });
const add = (left, right) => ({ kind: "binary", operator: "+", left, right });
const mul = (left, right) => ({ kind: "binary", operator: "*", left, right });
const assign = (targetSlot, value) => ({
  kind: "assign",
  assignmentOperator: "=",
  target: targetSlot,
  value,
});

test("scalar dataflow distinguishes live-ins, state, and branch-local values", () => {
  const statements = [{
    kind: "if",
    condition: {
      kind: "comparison",
      operator: "==",
      left: slot(0),
      right: slot(1),
    },
    body: [assign(2, slot(0))],
    alternative: [],
  }, assign(3, slot(2))];
  const flow = analysis.statementDataFlow(statements, 4);
  assert.deepEqual(flow.inputSlots, [0, 1, 2]);
  assert.deepEqual(flow.stateSlots, [2, 3]);
  assert.deepEqual(flow.localSlots, [3]);
  assert.deepEqual([...flow.definitelyAssigned].sort(), [3]);
});

test("dead-store elimination and versioned commoning remain independent", () => {
  const repeated = mul(slot(0), slot(1));
  const statements = [
    assign(2, repeated),
    assign(2, add(slot(0), slot(1))),
    assign(3, repeated),
  ];
  const reduced = analysis.eliminateDeadStores(statements, new Set([2, 3]));
  assert.equal(reduced.eliminatedAssignments, 1);
  assert.equal(reduced.statements.length, 2);
  assert.equal(analysis.statementsOperationCost(reduced.statements, 4), 2);
  const changedVersion = [1, 0, 0, 0];
  assert.notEqual(
    analysis.expressionStructuralKey(repeated, [0, 0, 0, 0]),
    analysis.expressionStructuralKey(repeated, changedVersion),
  );
});

test("loop-invariant and affine plans are target-neutral facts", () => {
  const recurrence = assign(0, add(mul(slot(0), slot(1)), slot(2)));
  const hoisted = analysis.hoistedExpressions(
    [recurrence],
    new Set([1, 2]),
    3,
  );
  assert.deepEqual(hoisted, []);
  assert.deepEqual(affineTarget([recurrence], [0]), {
    kind: "fixed-increment",
    accumulatorSlot: 0,
    multiplierSlot: 1,
    incrementSlot: 2,
  });
  const bytes = target.estimatedTargetCodeBytes([recurrence], 3);
  assert.ok(bytes > 0 && bytes <= target.MAX_TARGET_CODE_BYTES);
});
