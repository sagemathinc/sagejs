// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const incoming = (type, fields) => ({
  schema: "sagejs.comm-event/v1",
  type,
  data: {},
  metadata: {},
  buffers: [],
  ...fields,
});

test("upstream ipywidgets publishes and synchronizes an IntSlider model", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const published = [];
  session.on("comm", (event) => published.push(event));

  const created = await session.evaluate(
    [
      "import ipywidgets",
      "from IPython.display import display",
      "assert ipywidgets.__version__ == '8.1.9'",
      "slider = ipywidgets.IntSlider(value=3, min=-2, max=10, description='integer')",
      "display(slider)",
    ].join("\n"),
    { parentId: "widget-cell" },
  );
  const model = created.commEvents.find(
    (event) => event.data.state?._model_name === "IntSliderModel",
  );
  assert.ok(model, "IntSliderModel comm_open was not published");
  assert.equal(model.type, "open");
  assert.equal(model.targetName, "jupyter.widget");
  assert.deepEqual(model.metadata, { version: "2.1.0" });
  assert.equal(model.data.state.value, 3);
  assert.equal(model.data.state.min, -2);
  assert.equal(model.data.state.max, 10);
  assert.match(model.data.state.layout, /^IPY_MODEL_/);
  assert.match(model.data.state.style, /^IPY_MODEL_/);
  assert.equal(created.events.length, 1);
  assert.deepEqual(
    created.events[0].data["application/vnd.jupyter.widget-view+json"],
    { version_major: 2, version_minor: 0, model_id: model.commId },
  );
  const finalExpression = await session.evaluate("slider");
  assert.deepEqual(
    finalExpression.mimeBundle.data["application/vnd.jupyter.widget-view+json"],
    { version_major: 2, version_minor: 0, model_id: model.commId },
  );

  published.length = 0;
  await session.comm(
    incoming("message", {
      parentId: "slider-change",
      commId: model.commId,
      data: { method: "update", state: { value: 5 }, buffer_paths: [] },
    }),
  );
  assert.equal((await session.evaluate("slider.value")).repr, "5");
  assert.ok(
    published.some(
      (event) =>
        event.commId === model.commId &&
        event.data.method === "echo_update" &&
        event.data.state.value === 5,
    ),
  );

  published.length = 0;
  await session.evaluate("slider.value = 7");
  assert.ok(
    published.some(
      (event) =>
        event.commId === model.commId &&
        event.data.method === "update" &&
        event.data.state.value === 7,
    ),
  );
});

test("upstream Image keeps binary state outside widget JSON", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const created = await session.evaluate(
    [
      "import ipywidgets",
      "image = ipywidgets.Image(value=b'\\x89PNG\\r\\n\\x1a\\n', format='png')",
    ].join("\n"),
  );
  const model = created.commEvents.find(
    (event) => event.data.state?._model_name === "ImageModel",
  );
  assert.ok(model, "ImageModel comm_open was not published");
  assert.deepEqual(model.data.buffer_paths, [["value"]]);
  assert.equal(Object.hasOwn(model.data.state, "value"), false);
  assert.deepEqual(Array.from(model.buffers[0]), [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("upstream FileUpload receives browser binary buffers as memoryviews", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const created = await session.evaluate(
    [
      "import ipywidgets",
      "received = []",
      "upload = ipywidgets.FileUpload()",
      "def receive(change):",
      "    item = change['new'][0]",
      "    received.append((item['name'], item['content'].tobytes()))",
      "upload.observe(receive, names='value')",
    ].join("\n"),
  );
  const model = created.commEvents.find(
    (event) => event.data.state?._model_name === "FileUploadModel",
  );
  assert.ok(model, "FileUploadModel comm_open was not published");

  await session.comm(
    incoming("message", {
      parentId: "file-upload-change",
      commId: model.commId,
      data: {
        method: "update",
        state: {
          value: [{
            name: "example.txt",
            type: "text/plain",
            size: 3,
            last_modified: 0,
          }],
        },
        buffer_paths: [["value", 0, "content"]],
      },
      buffers: [Uint8Array.from([65, 66, 67])],
    }),
  );
  await session.evaluate(
    "assert upload.value[0]['content'].tobytes() == b'ABC'\n" +
      "assert received == [('example.txt', b'ABC')]",
  );
});
