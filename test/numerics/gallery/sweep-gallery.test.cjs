#!/usr/bin/env node
// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const generator = require("./generate-sweep-story.cjs");
const storyText = readFileSync(generator.outputPath, "utf8");
const story = JSON.parse(storyText);

function pointer(root, path) {
  let value = root;
  for (const rawToken of path.slice(1).split("/")) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    value = value[token];
  }
  return value;
}

test("ODE parameter-sweep story is generated from current public contracts", () => {
  generator.main([]);
  assert.equal(story.schema, "sagejs.numerics.gallery.sweep-story/v1");
  assert.equal(story.id, "ode-parameter-sweep");
  assert.equal(story.cases.length, 2);
  assert.deepEqual(story.cases.map((item) => item.kind), ["success", "failure"]);
  for (const caseRecord of story.cases) {
    for (const path of caseRecord.evidence) {
      assert.notEqual(pointer(caseRecord, path), undefined, path);
    }
  }
});

test("success and partial failure retain honest item-level evidence", () => {
  const [success, failure] = story.cases;
  assert.equal(success.result.status, "completed");
  assert.equal(success.result.success, true);
  assert.deepEqual(success.result.counts, {
    planned: 5,
    completed: 5,
    failed: 0,
    skipped: 0,
  });
  assert.equal(success.independent_oracle.passed, true);
  assert.equal(success.independent_oracle.checks.length, 5);
  assert.ok(success.independent_oracle.checks.every((check) => check.passed));
  assert.equal(
    success.presentation.explanation.evidence.validated_item_count,
    5,
  );

  assert.equal(failure.result.status, "completed_with_failures");
  assert.equal(failure.result.success, false);
  assert.deepEqual(failure.result.items.map((item) => item.status), [
    "completed",
    "completed",
    "completed",
    "callback_error",
    "completed",
  ]);
  const retainedFailure = failure.presentation.explanation.evidence.failures[0];
  assert.equal(retainedFailure.index, 3);
  assert.deepEqual(retainedFailure.parameter, { rate: 2 });
  assert.equal(retainedFailure.error.type, "OdeSweepSolveError");
  assert.equal(
    retainedFailure.error.message,
    "maximum_evaluations/maximum_evaluations",
  );
  assert.equal(failure.independent_oracle.passed, true);
  assert.equal(failure.independent_oracle.checks.length, 4);
  assert.equal(
    failure.presentation.plot_spec.layers[0].data.x.includes(2),
    false,
    "failed item received an invented plot coordinate",
  );
});

test("presentation freezes callbacks and animates only exact retained prefixes", () => {
  for (const caseRecord of story.cases) {
    const presentation = caseRecord.presentation;
    assert.equal(presentation.computed_evidence_only, true);
    assert.equal(presentation.callback_reevaluated, false);
    assert.equal(
      presentation.callback_count_after,
      presentation.callback_count_before,
    );
    assert.equal(
      presentation.explanation.provenance.callback_reevaluated,
      false,
    );
    const animation = presentation.plot_animation;
    assert.deepEqual(
      animation.metadata.selected_completed_item_counts,
      [0, 1, 2, 3, 4, 5],
    );
    assert.equal(animation.metadata.interpolation, "none");
    assert.equal(animation.metadata.computed_evidence_only, true);
    assert.equal(animation.metadata.callback_reevaluated, false);
    assert.ok(animation.frames.every((frame) =>
      frame.metadata.interpolated === false
    ));
    assert.deepEqual(
      presentation.plotly.figure.frames.map((frame) => frame.name),
      animation.frames.map((frame) => frame.id),
    );
    const controls = animation.controls;
    for (const name of ["play", "pause", "step", "restart", "speed", "slider"]) {
      assert.equal(controls[name], true, `${name} control is unavailable`);
    }
    assert.equal(controls.autoplay, false);
    assert.equal(controls.loop, false);
    const protocol = presentation.plotly.figure.layout.meta
      .sagejs_animation_controls;
    assert.equal(protocol.computed_frames_only, true);
    assert.equal(protocol.capabilities.step.route, "host-relative-frame-controller");
    assert.equal(protocol.capabilities.speed.route, "host-duration-controller");
  }
});

test("checked story payload and presentation remain inside explicit budgets", () => {
  assert.equal(
    story.measurements.story_bytes,
    Buffer.byteLength(storyText),
  );
  assert.ok(story.measurements.story_bytes <= story.budgets.max_story_bytes);
  for (const caseRecord of story.cases) {
    const measured = caseRecord.measurements;
    assert.ok(measured.result_bytes <= story.budgets.max_result_bytes);
    assert.ok(measured.animation_frames <= story.budgets.max_animation_frames);
    assert.ok(measured.max_frame_scalars <= story.budgets.max_scalars_per_frame);
    assert.ok(
      measured.semantic_animation_bytes <=
        story.budgets.max_semantic_animation_bytes,
    );
    assert.ok(measured.plotly_bytes <= story.budgets.max_plotly_bytes);
  }
});
