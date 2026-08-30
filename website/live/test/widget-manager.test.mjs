import assert from "node:assert/strict";
import test from "node:test";

import {
  createWidgetHost,
  WIDGET_VIEW_MIME,
} from "../widget-manager.mjs";

class TestSession {
  listeners = new Map();
  sent = [];

  on(type, listener) {
    this.listeners.set(type, listener);
  }

  off(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  async comm(event) {
    this.sent.push(event);
  }

  emit(event) {
    this.listeners.get("comm")?.(event);
  }
}

const event = (type, fields) => ({
  schema: "sagejs.comm-event/v1",
  type,
  commId: "model-1",
  data: {},
  metadata: {},
  buffers: [],
  ...fields,
});

test("widget host stores model state, buffers, and routes both comm directions", async () => {
  const session = new TestSession();
  let environment;
  let rendered;
  const host = createWidgetHost({
    session,
    async loadManager() {
      return {
        createWidgetManager(value) {
          environment = value;
          return {
            async render(modelId, destination) {
              const state = await value.getSerializedModelState(modelId);
              const comm = await value.openCommChannel({
                comm_id: modelId,
                target_name: "jupyter.widget",
              });
              rendered = { modelId, destination, state, comm };
            },
          };
        },
      };
    },
    async renderOutput() {},
  });

  session.emit(event("open", {
    targetName: "jupyter.widget",
    data: {
      state: {
        _model_name: "ImageModel",
        _model_module: "@jupyter-widgets/controls",
        _model_module_version: "2.0.0",
        binary: {},
      },
      buffer_paths: [["binary", "value"]],
    },
    buffers: [Uint8Array.from([1, 2, 3])],
  }));
  const destination = {};
  assert.equal(host.isWidgetDisplay({ [WIDGET_VIEW_MIME]: {} }), true);
  await host.render({
    [WIDGET_VIEW_MIME]: { version_major: 2, model_id: "model-1" },
  }, destination);

  assert.equal(rendered.modelId, "model-1");
  assert.equal(rendered.destination, destination);
  assert.equal(rendered.state.modelName, "ImageModel");
  assert.deepEqual(
    Array.from(new Uint8Array(rendered.state.state.binary.value.buffer)),
    [1, 2, 3],
  );
  assert.equal(session.sent.length, 0, "opening an existing kernel model must not send comm_open");

  const received = [];
  rendered.comm.on_msg((message) => received.push(message));
  session.emit(event("message", {
    parentId: "cell-1",
    data: { method: "update", state: { value: 7 }, buffer_paths: [] },
  }));
  assert.equal(received[0].content.data.state.value, 7);
  assert.equal(received[0].parent_header.msg_id, "cell-1");

  const messageId = rendered.comm.send({ method: "update", state: { value: 8 } });
  assert.equal(typeof messageId, "string");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(session.sent[0].type, "message");
  assert.equal(session.sent[0].commId, "model-1");
  assert.equal(session.sent[0].parentId, messageId);
  assert.equal(session.sent[0].data.state.value, 8);

  host.reset();
  assert.equal(await environment.getSerializedModelState("model-1"), undefined);
  host.close();
  assert.equal(session.listeners.has("comm"), false);
});

test("frontend-created comms publish an open event", async () => {
  const session = new TestSession();
  let environment;
  const host = createWidgetHost({
    session,
    async loadManager() {
      return {
        createWidgetManager(value) {
          environment = value;
          return { async render() {} };
        },
      };
    },
    async renderOutput() {},
  });
  session.emit(event("open", {
    targetName: "jupyter.widget",
    data: {
      state: {
        _model_name: "LayoutModel",
        _model_module: "@jupyter-widgets/base",
        _model_module_version: "2.0.0",
      },
      buffer_paths: [],
    },
  }));
  await host.render({
    [WIDGET_VIEW_MIME]: { model_id: "model-1" },
  }, {});
  await environment.openCommChannel({
    comm_id: "frontend-1",
    target_name: "custom.target",
    data: { hello: "world" },
  });
  assert.equal(session.sent.at(-1).type, "open");
  assert.equal(session.sent.at(-1).targetName, "custom.target");
  host.close();
});

test("Output widgets capture parent-scoped display events locally", async () => {
  const session = new TestSession();
  let outputComm;
  const host = createWidgetHost({
    session,
    async loadManager() {
      return {
        createWidgetManager(environment) {
          return {
            async render(modelId) {
              outputComm = await environment.openCommChannel({
                comm_id: modelId,
                target_name: "jupyter.widget",
              });
            },
          };
        },
      };
    },
    async renderOutput() {},
  });
  session.emit(event("open", {
    data: {
      state: {
        _model_name: "OutputModel",
        _model_module: "@jupyter-widgets/output",
        _model_module_version: "1.0.0",
        msg_id: "",
        outputs: [],
      },
      buffer_paths: [],
    },
  }));
  await host.render({ [WIDGET_VIEW_MIME]: { model_id: "model-1" } }, {});
  const messages = [];
  outputComm.on_msg((message) => messages.push(message));
  session.emit(event("message", {
    data: {
      method: "update",
      state: { msg_id: "cell-2" },
      buffer_paths: [],
    },
  }));
  assert.equal(host.captureOutput({
    schema: "sagejs.output-event/v1",
    type: "stream",
    parentId: "different-cell",
    name: "stdout",
    text: "outside",
  }), false);
  assert.equal(host.captureOutput({
    schema: "sagejs.output-event/v1",
    type: "stream",
    parentId: "cell-2",
    name: "stdout",
    text: "inside",
  }), true);
  assert.equal(
    messages.at(-1).content.data.state.outputs[0].text,
    "inside",
  );
  host.captureOutput({
    schema: "sagejs.output-event/v1",
    type: "clear_output",
    parentId: "cell-2",
    wait: true,
  });
  host.captureOutput({
    schema: "sagejs.output-event/v1",
    type: "display_data",
    parentId: "cell-2",
    data: { "text/plain": "replacement" },
    metadata: {},
  });
  assert.deepEqual(
    messages.at(-1).content.data.state.outputs.map((item) => item.data?.["text/plain"]),
    ["replacement"],
  );
  host.close();
});
