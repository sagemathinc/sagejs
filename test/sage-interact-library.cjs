#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("PREP plotting and calculus interacts execute their documented defaults", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());

  const evaluated = await session.evaluate(
    [
      "@interact",
      "def plot_example(",
      "    f=sin(x^2),",
      "    r=range_slider(-5, 5, step_size=1/4, default=(-3, 3)),",
      "    color=color_selector(widget='colorpicker'),",
      "    thickness=(3, (1..10)),",
      "    adaptive_recursion=(5, (0..10)),",
      "    adaptive_tolerance=(0.01, (0.001, 1)),",
      "    plot_points=(20, (1..100)),",
      "    linestyle=['-', '--', '-.', ':'],",
      "    gridlines=False, fill=False, frame=False, axes=True",
      "):",
      "    show(plot(",
      "        f, (x, r[0], r[1]), color=color, thickness=thickness,",
      "        adaptive_recursion=adaptive_recursion,",
      "        adaptive_tolerance=adaptive_tolerance,",
      "        plot_points=plot_points, linestyle=linestyle,",
      "        fill=fill if fill else None",
      "    ), gridlines=gridlines, frame=frame, axes=axes)",
      "assert len(plot_example.widget.kwargs_widgets) == 12",
      "assert [type(widget).__name__ for widget in plot_example.widget.kwargs_widgets] == [",
      "    'EvalText', 'FloatRangeSlider', 'SageColorPicker',",
      "    'SelectionSlider', 'SelectionSlider', 'FloatSlider',",
      "    'SelectionSlider', 'Dropdown', 'Checkbox', 'Checkbox',",
      "    'Checkbox', 'Checkbox'",
      "]",
      "f(x) = x^3 + 1",
      "@interact",
      "def tangent(c=(1/3, (-1, 1))):",
      "    derivative_value = derivative(f, x)",
      "    line_function(x) = derivative_value(c)*(x-c) + f(c)",
      "    show(",
      "        plot(f, (x, -1, 1))",
      "        + plot(line_function, (x, -1, 1), color='red', linestyle='--')",
      "        + point((c, f(c)), pointsize=40, color='red'),",
      "        ymin=0, ymax=2",
      "    )",
      "assert type(tangent.widget.kwargs_widgets[0]).__name__ == 'IntSlider'",
      "assert tangent.widget.kwargs_widgets[0].value == 0",
      "print('sage-prep-calculus-plotting-ok')",
    ].join("\n"),
    { parentId: "sage-prep-calculus-plotting" },
  );
  assert.equal(evaluated.stdout, "sage-prep-calculus-plotting-ok\n");
  assert.deepEqual(
    evaluated.events.filter((event) => event.type === "error"),
    [],
  );
});

test("bundled Sage interact library is lazy and executes a representative subset", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());

  const completion = await session.complete("interacts.", 10);
  assert.ok(completion.matches.includes("calculus"));
  assert.ok(completion.matches.includes("demo"));
  assert.ok(completion.matches.includes("statistics"));

  const evaluated = await session.evaluate(
    [
      "from sage.interacts.library import library_interact",
      "assert library_interact is not None",
      "assert eval('2^3') == 1",
      "assert sage_eval('2^3') == 8",
      "assert sage_eval('1/2') == 1/2",
      "assert dir(interacts) == ['calculus', 'demo', 'statistics']",
      "assert interacts.demo() is None",
      "assert interacts.calculus.taylor_polynomial() is None",
      "assert interacts.calculus.function_derivative() is None",
      "assert interacts.calculus.quadratic_equation() is None",
      "assert interacts.statistics.coin() is None",
      "applications = [",
      "    interacts.demo,",
      "    interacts.calculus.taylor_polynomial,",
      "    interacts.calculus.function_derivative,",
      "    interacts.calculus.quadratic_equation,",
      "    interacts.statistics.coin,",
      "]",
      "assert [len(application.__wrapped__.widget.kwargs_widgets) for application in applications] == [2, 3, 4, 3, 2]",
      "first = interacts.demo._widgets['n']()",
      "second = interacts.demo._widgets['n']()",
      "assert first is not second",
      "print('sage-interact-library-ok')",
    ].join("\n"),
    { parentId: "sage-interact-library" },
  );
  assert.equal(evaluated.stdout, "0\nsage-interact-library-ok\n");
  assert.deepEqual(
    evaluated.events.filter((event) => event.type === "error"),
    [],
  );
  assert.ok(
    evaluated.commEvents.filter(
      (event) => event.data.state?._model_name === "VBoxModel",
    ).length >= 5,
  );
});
