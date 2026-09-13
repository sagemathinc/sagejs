// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("IPython display facade publishes one ordered transport-neutral stream", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const observed = [];
  session.on("output", (event) => observed.push(event));

  const result = await session.evaluate(
    [
      "from IPython.display import Markdown, clear_output, display",
      "handle = display(Markdown('**first**'), display_id=True)",
      "print('between')",
      "handle.update(3/4)",
      "clear_output(wait=True)",
    ].join("\n"),
    { parentId: "cell-17" },
  );

  assert.equal(result.repr, "");
  assert.equal(result.stdout, "between\n");
  assert.deepEqual(result.events, observed);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["display_data", "stream", "update_display_data", "clear_output"],
  );
  assert.ok(result.events.every((event) => event.parentId === "cell-17"));
  assert.equal(result.events[0].data["text/markdown"], "**first**");
  assert.equal(result.events[0].displayId, "display-000001");
  assert.equal(result.events[1].text, "between\n");
  assert.equal(result.events[2].data["text/plain"], "3/4");
  assert.equal(result.events[2].displayId, "display-000001");
  assert.equal(result.events[3].wait, true);
});

test("display callbacks and shell parent metadata are session scoped", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const callbackEvents = [];
  const result = await session.evaluate(
    [
      "from IPython import get_ipython",
      "from IPython.display import HTML, display",
      "assert get_ipython().get_parent()['header']['msg_id'] == 'request-9'",
      "display(HTML('<strong>ok</strong>'))",
    ].join("\n"),
    {
      parentId: "request-9",
      onEvent: (event) => callbackEvents.push(event),
    },
  );

  assert.deepEqual(result.events, callbackEvents);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].data["text/html"], "<strong>ok</strong>");
});
