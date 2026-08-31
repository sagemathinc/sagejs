import assert from "node:assert/strict";
import test from "node:test";

import {
  createWidgetHost,
  WIDGET_VIEW_MIME,
} from "../widget-manager.mjs";

class TestSession {
  listeners = new Map();
  sent = [];
  handlers = [];

  on(type, listener) {
    this.listeners.set(type, listener);
  }

  off(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  async comm(event, handlers) {
    this.sent.push(event);
    this.handlers.push(handlers);
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
  assert.equal(session.handlers[0].timeout, 15_000);

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

test("widget host bounds live models and closes rejected kernel comms", async () => {
  const session = new TestSession();
  const violations = [];
  const host = createWidgetHost({
    session,
    limits: {
      callbackTimeoutMs: 50,
      liveModels: 1,
      liveViews: 2,
      queuedEvents: 2,
    },
    onViolation(error) {
      violations.push(error);
    },
    async loadManager() {
      return { createWidgetManager() { return { async render() {} }; } };
    },
    async renderOutput() {},
  });
  session.emit(event("open", {
    data: { state: { _model_name: "IntModel" }, buffer_paths: [] },
  }));
  session.emit(event("open", {
    commId: "model-2",
    data: { state: { _model_name: "IntModel" }, buffer_paths: [] },
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(violations[0].message, /1 live-model limit/);
  assert.equal(session.sent.at(-1).type, "close");
  assert.equal(session.sent.at(-1).commId, "model-2");
  assert.deepEqual(host.stats(), {
    models: 1,
    rejectedModels: 1,
    comms: 0,
    views: 0,
    queuedEvents: 0,
    limits: {
      callbackTimeoutMs: 50,
      liveModels: 1,
      liveViews: 2,
      queuedEvents: 2,
    },
  });
  await assert.rejects(
    host.render({ [WIDGET_VIEW_MIME]: { model_id: "model-2" } }, {}),
    /1 live-model limit/,
  );
  host.close();
});

test("widget reset removes live views and leaves a rerun notice", async () => {
  const session = new TestSession();
  let removed = 0;
  const ownerDocument = {
    createElement() {
      return { className: "", textContent: "" };
    },
  };
  const element = {
    isConnected: true,
    ownerDocument,
    widget: { remove() { removed += 1; } },
    replaceWith(replacement) {
      this.replacement = replacement;
    },
  };
  const destination = { children: [] };
  const host = createWidgetHost({
    session,
    limits: {
      callbackTimeoutMs: 50,
      liveModels: 2,
      liveViews: 1,
      queuedEvents: 2,
    },
    async loadManager() {
      return {
        createWidgetManager() {
          return {
            async render(_modelId, target) {
              target.children.push(element);
            },
          };
        },
      };
    },
    async renderOutput() {},
  });
  session.emit(event("open", {
    data: { state: { _model_name: "IntModel" }, buffer_paths: [] },
  }));
  await host.render({ [WIDGET_VIEW_MIME]: { model_id: "model-1" } }, destination);
  assert.equal(host.stats().views, 1);
  await assert.rejects(
    host.render({ [WIDGET_VIEW_MIME]: { model_id: "model-1" } }, destination),
    /1 live-view limit/,
  );
  host.reset();
  assert.equal(removed, 1);
  assert.match(element.replacement.textContent, /Run its input again/);
  assert.equal(host.stats().views, 0);
  host.close();
});

test("widget host bounds queued frontend events", async () => {
  let resolveRequest;
  const session = new TestSession();
  session.comm = function comm(event, handlers) {
    this.sent.push(event);
    this.handlers.push(handlers);
    return new Promise((resolve) => {
      resolveRequest = resolve;
    });
  };
  const violations = [];
  let environment;
  const host = createWidgetHost({
    session,
    limits: {
      callbackTimeoutMs: 50,
      liveModels: 2,
      liveViews: 2,
      queuedEvents: 1,
    },
    onViolation(error) {
      violations.push(error);
    },
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
    data: { state: { _model_name: "IntModel" }, buffer_paths: [] },
  }));
  await host.render({ [WIDGET_VIEW_MIME]: { model_id: "model-1" } }, {});
  const comm = await environment.openCommChannel({
    comm_id: "model-1",
    target_name: "jupyter.widget",
  });
  comm.send({ method: "custom", content: { value: 1 } });
  const replies = [];
  comm.send(
    { method: "custom", content: { value: 2 } },
    { shell: { reply: (message) => replies.push(message) } },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(violations[0].message, /1 queued-event limit/);
  assert.equal(replies[0].content.status, "error");
  assert.equal(host.stats().queuedEvents, 1);
  resolveRequest();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(host.stats().queuedEvents, 0);
  host.close();
});
