#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const root = resolve(__dirname, "..");

const incoming = (fields) => ({
  schema: "sagejs.comm-event/v1",
  type: "message",
  data: {},
  metadata: {},
  buffers: [],
  ...fields,
});

test("Sage PREP automatic widget inference matches Sage", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());

  const evaluated = await session.evaluate(
    [
      "from sagejs.interacts import sage_interactive",
      "widgets = [",
      "    sage_interactive.widget_from_abbrev(True),",
      "    sage_interactive.widget_from_abbrev('hello'),",
      "    sage_interactive.widget_from_abbrev(3),",
      "    sage_interactive.widget_from_abbrev(1.5),",
      "    sage_interactive.widget_from_abbrev([1, 2, 3]),",
      "    sage_interactive.widget_from_abbrev(iter([1, 2, 3])),",
      "    sage_interactive.widget_from_abbrev(('lower', -3)),",
      "    sage_interactive.widget_from_abbrev((3, (0, 10))),",
      "    sage_interactive.widget_from_abbrev((1, 20)),",
      "    sage_interactive.widget_from_abbrev((1, 20, 1)),",
      "]",
      "assert [type(widget).__name__ for widget in widgets] == [",
      "    'Checkbox', 'Text', 'IntSlider', 'FloatSlider', 'Dropdown',",
      "    'SelectionSlider', 'IntSlider', 'IntSlider', 'IntSlider',",
      "    'IntSlider'",
      "]",
      "assert [widget.value for widget in widgets] == [",
      "    True, 'hello', 3, 1.5, 1, 1, -3, 3, 10, 10",
      "]",
      "assert widgets[6].description == 'lower'",
      "print('sage-prep-inference-ok')",
    ].join("\n"),
  );
  assert.equal(evaluated.stdout, "sage-prep-inference-ok\n");
});

test("Sage PREP explicit controls preserve mathematical values", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());

  const evaluated = await session.evaluate(
    [
      "from sagejs.interacts import sage_interactive",
      "expression = input_box('4 + 5')",
      "typed = input_box('4 + 5', type=float)",
      "choice = slider([sin, cos, tan], default=cos)",
      "buttons = selector([(1, 'one'), (2, 'two')], buttons=True)",
      "matrix_widget = sage_interactive.widget_from_abbrev(identity_matrix(2))",
      "vector_widget = input_grid(",
      "    1, 3, default=[[1, 2, 3]],",
      "    to_value=lambda rows: vector(flatten(rows))",
      ")",
      "assert expression.get_interact_value() == 9",
      "assert typed.get_interact_value() == 9.0",
      "assert choice.get_interact_value() is cos",
      "assert buttons.value == 1",
      "assert type(matrix_widget).__name__ == 'Grid'",
      "assert matrix_widget.get_interact_value() == identity_matrix(2)",
      "assert vector_widget.get_interact_value() == vector([1, 2, 3])",
      "assert flatten([[[3], []]], max_level=1) == [[3], []]",
      "print('sage-prep-controls-ok')",
    ].join("\n"),
  );
  assert.equal(evaluated.stdout, "sage-prep-controls-ok\n");
});

test("Sage PREP layout and manual-update contracts work", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());

  const evaluated = await session.evaluate(
    [
      "@interact(layout=dict(",
      "    top=[['f', 'color']],",
      "    left=[['axes'], ['fill']],",
      "    bottom=[['zoom']]",
      "))",
      "def arranged(",
      "    f=input_box(x^2, width=20),",
      "    color=color_selector('red'),",
      "    axes=True,",
      "    fill=True,",
      "    zoom=range_slider(-3, 3, default=(-3, 3))",
      "):",
      "    return (f, color.html_color(), axes, fill, zoom)",
      "assert [type(child).__name__ for child in arranged.widget.children] == [",
      "    'VBox', 'HBox', 'VBox'",
      "]",
      "assert len(arranged.widget.kwargs_widgets) == 5",
      "assert 'with 5 widgets' in repr(arranged.widget)",
      "calls = []",
      "@interact",
      "def manual(n=(1, 5, 1), auto_update=False):",
      "    calls.append(n)",
      "    return n^2",
      "assert calls == [3] and manual.widget.result == 9",
      "manual.widget.kwargs_widgets[0].value = 5",
      "assert calls == [3]",
      "manual.widget.manual_button.click()",
      "assert calls == [3, 5] and manual.widget.result == 25",
      "print('sage-prep-layout-manual-ok')",
    ].join("\n"),
    { parentId: "sage-prep-layout" },
  );
  assert.equal(evaluated.stdout, "sage-prep-layout-manual-ok\n");
  assert.ok(
    evaluated.commEvents.some(
      (event) => event.data.state?._model_name === "HBoxModel",
    ),
  );
});

test("interact callback failures remain local to their Output widget", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());

  const created = await session.evaluate(
    [
      "@interact",
      "def fragile(n=(0, 1, 1)):",
      "    if n:",
      "        raise ValueError('localized interact failure')",
      "    return 17",
      "assert fragile.widget.result == 17",
    ].join("\n"),
    { parentId: "sage-prep-fragile" },
  );
  const slider = created.commEvents.find(
    (event) => event.data.state?._model_name === "IntSliderModel",
  );
  assert.ok(slider);
  await session.comm(
    incoming({
      parentId: "sage-prep-fragile-update",
      commId: slider.commId,
      data: { method: "update", state: { value: 1 }, buffer_paths: [] },
    }),
  );
  assert.equal((await session.evaluate("40 + 2")).repr, "42");
  assert.equal((await session.evaluate("fragile.widget.result")).repr, "17");
});

test("Sage interact is useful in the text-only CLI", () => {
  const source = [
    "calls = []",
    "@interact",
    "def square(n=2):",
    "    calls.append(n)",
    "    return n^2",
    "assert calls == [2] and square.widget.result == 4",
    "print('sage-interact-cli-ok')",
    "",
  ].join("\n");
  const result = spawnSync(process.execPath, [resolve(root, "bin", "sagejs")], {
    cwd: root,
    encoding: "utf8",
    input: source,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Interactive function .* with 1 widget/);
  assert.match(result.stdout, /sage-interact-cli-ok/);
  assert.doesNotMatch(result.stderr, /rich display requires/);
});
