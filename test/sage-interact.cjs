// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const incoming = (fields) => ({
  schema: "sagejs.comm-event/v1",
  type: "message",
  data: {},
  metadata: {},
  buffers: [],
  ...fields,
});

test("Sage interact controls are lazy globals with Sage value conversions", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());

  const completion = await session.complete("inter", 5);
  assert.ok(completion.matches.includes("interact"));

  const evaluated = await session.evaluate(
    [
      "u = 7",
      "expression = input_box('u + 2')",
      "single = slider(1, 9, 2, 5)",
      "interval = range_slider(0, 10, 2, (2, 8))",
      "flag = checkbox(False, 'flag')",
      "choice = selector([1, 2, 3], default=2)",
      "color = color_selector('red')",
      "grid = input_grid(2, 2, [[1, 2], [3, 4]])",
      "label = text_control(value=r'\\(x^2\\)')",
      "assert expression.get_interact_value() == 9",
      "assert single.value == 5",
      "assert interval.value == (2, 8)",
      "assert flag.value is False",
      "assert choice.value == 2",
      "assert color.get_interact_value().html_color() == '#ff0000'",
      "assert grid.get_interact_value() == [[1, 2], [3, 4]]",
      "assert label.description == ''",
      "print('sage-controls-ok')",
    ].join("\n"),
  );
  assert.equal(evaluated.stdout, "sage-controls-ok\n");
  assert.ok(
    evaluated.commEvents.some(
      (event) => event.data.state?._model_name === "IntRangeSliderModel",
    ),
  );
  assert.ok(
    evaluated.commEvents.some(
      (event) => event.data.state?._model_name === "ColorPickerModel",
    ),
  );
});

test("Sage @interact renders and responds to frontend state updates", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());

  const created = await session.evaluate(
    [
      "@interact",
      "def square(n=(1, 5, 1)):",
      "    return n^2",
      "assert square.widget.result == 9",
    ].join("\n"),
    { parentId: "sage-interact-cell" },
  );
  const slider = created.commEvents.find(
    (event) => event.data.state?._model_name === "IntSliderModel",
  );
  const container = created.commEvents.find(
    (event) => event.data.state?._model_name === "VBoxModel",
  );
  const output = created.commEvents.find(
    (event) => event.data.state?._model_name === "OutputModel",
  );
  assert.ok(slider, "@interact did not publish its slider model");
  assert.ok(container, "@interact did not publish its container model");
  assert.ok(output, "@interact did not publish its output model");
  assert.ok(
    created.events.some(
      (event) =>
        event.type === "display_data" &&
        event.data?.["application/vnd.jupyter.widget-view+json"]?.model_id ===
          container.commId,
    ),
    "@interact did not publish a standard widget view",
  );

  await session.comm(
    incoming({
      parentId: "sage-interact-change",
      commId: slider.commId,
      data: { method: "update", state: { value: 5 }, buffer_paths: [] },
    }),
  );
  assert.equal(
    (await session.evaluate("(square.widget.result, square.widget.kwargs['n'])"))
      .repr,
    "(25, 5)",
  );
});

test("Sage html and pretty_print publish compatible rich output", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());

  const evaluated = await session.evaluate(
    [
      "heading = html('<h2>Area $x^2$</h2>')",
      "assert type(heading).__name__ == 'HtmlFragment'",
      "assert r'\\(x^2\\)' in heading",
      "pretty_print(heading)",
      "pretty_print(x^2)",
    ].join("\n"),
    { parentId: "sage-pretty-print" },
  );
  const htmlEvent = evaluated.events.find(
    (event) => event.type === "display_data" && event.data?.["text/html"],
  );
  assert.ok(htmlEvent, "pretty_print(html(...)) did not publish HTML");
  assert.match(htmlEvent.data["text/html"], /<h2>Area \\\(x\^2\\\)<\/h2>/);
  assert.ok(
    evaluated.events.some(
      (event) => event.type === "display_data" && event.data?.["text/latex"],
    ),
    "pretty_print(symbolic expression) did not publish LaTeX",
  );

  const direct = await session.evaluate("html(2/3)");
  assert.match(direct.mimeBundle?.data?.["text/html"] ?? "", /frac\{2\}\{3\}/);
});
