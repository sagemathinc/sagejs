// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const {
  PLOTLY_RENDERER_HEADER_BYTES,
  PLOTLY_RENDERER_HEADER_INTS,
  PLOTLY_RENDERER_ERROR_LIMIT,
  PLOTLY_RENDERER_STATE_ERROR,
  PLOTLY_RENDERER_STATE_SUCCESS,
  SynchronousPlotlyRenderer,
  writePlotlyRendererResponse,
} = require("../dist/tools/plotly-renderer-client.js");

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

function respond(worker, message, state, payload) {
  const configuration = worker.options.workerData;
  const output = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(JSON.stringify(payload));
  writePlotlyRendererResponse(
    configuration.shared,
    configuration.maxOutputBytes,
    message.requestId,
    state,
    output,
  );
}

function fakeFactory(behavior) {
  const workers = [];
  const createWorker = (_filename, options) => {
    const worker = {
      options,
      messages: [],
      terminated: 0,
      unreferenced: false,
      postMessage(message) {
        this.messages.push(message);
        behavior(this, message, workers.length - 1);
      },
      terminate() {
        this.terminated += 1;
        return Promise.resolve(0);
      },
      unref() {
        this.unreferenced = true;
      },
    };
    workers.push(worker);
    return worker;
  };
  return { createWorker, workers };
}

function renderer(factory, options = {}) {
  return new SynchronousPlotlyRenderer({
    executablePath: "/fake/chromium",
    timeoutMs: 20,
    shutdownTimeoutMs: 20,
    idleTimeoutMs: 1234,
    maxJobsPerBrowser: 7,
    maxRequestBytes: 1024,
    maxOutputBytes: 1024,
    createWorker: factory.createWorker,
    ...options,
  });
}

function assertCode(code, callback) {
  assert.throws(callback, (error) => {
    assert.equal(error.code, code);
    assert.deepEqual(error.alternatives, ["html", "json"]);
    return true;
  });
}

function testReuseAndConfiguration() {
  const factory = fakeFactory((worker, message) => {
    respond(worker, message, PLOTLY_RENDERER_STATE_SUCCESS, PNG);
  });
  const client = renderer(factory);
  assert.deepEqual(client.render("{}"), PNG);
  assert.deepEqual(client.render("{}"), PNG);
  assert.equal(factory.workers.length, 1);
  assert.equal(factory.workers[0].unreferenced, true);
  assert.equal(factory.workers[0].options.workerData.idleTimeoutMs, 1234);
  assert.equal(factory.workers[0].options.workerData.maxJobsPerBrowser, 7);
  assert.deepEqual(client.stats(), {
    workers_created: 1,
    render_requests: 2,
    renderer_restarts: 0,
  });
  client.terminateNow();
}

function testTimeoutAndHardExitFallback() {
  const factory = fakeFactory(() => {});
  const client = renderer(factory, { timeoutMs: 2 });
  assertCode("SAGEJS_GRAPHICS_EXPORT_TIMEOUT", () => client.render("{}"));
  assert.equal(factory.workers.length, 1);
  assert.equal(factory.workers[0].terminated, 1);
  assert.equal(client.stats().renderer_restarts, 0);
}

function testTinyResponseBuffer() {
  const shared = new SharedArrayBuffer(PLOTLY_RENDERER_HEADER_BYTES + 1);
  assert.doesNotThrow(() =>
    writePlotlyRendererResponse(
      shared,
      1,
      42,
      PLOTLY_RENDERER_STATE_SUCCESS,
      PNG,
    ),
  );
  const control = new Int32Array(shared, 0, PLOTLY_RENDERER_HEADER_INTS);
  assert.equal(Atomics.load(control, 0), PLOTLY_RENDERER_STATE_ERROR);
  assert.equal(Atomics.load(control, 1), 0);
  assert.equal(Atomics.load(control, 2), 42);
  assert.equal(Atomics.load(control, 3), PLOTLY_RENDERER_ERROR_LIMIT);

  const factory = fakeFactory((worker, message) => {
    respond(worker, message, PLOTLY_RENDERER_STATE_SUCCESS, PNG);
  });
  const client = renderer(factory, { maxOutputBytes: 1 });
  assertCode("SAGEJS_GRAPHICS_EXPORT_LIMIT", () => client.render("{}"));
  client.terminateNow();
}

function testCrashRestartOnce() {
  const factory = fakeFactory((worker, message, index) => {
    if (index === 0) {
      respond(worker, message, PLOTLY_RENDERER_STATE_ERROR, {
        code: "SAGEJS_GRAPHICS_RENDER_FAILED",
        message: "browser disconnected",
        retryable: true,
      });
    } else {
      respond(worker, message, PLOTLY_RENDERER_STATE_SUCCESS, PNG);
    }
  });
  const client = renderer(factory);
  assert.deepEqual(client.render("{}"), PNG);
  assert.equal(factory.workers.length, 2);
  assert.equal(factory.workers[0].terminated, 1);
  assert.deepEqual(client.stats(), {
    workers_created: 2,
    render_requests: 1,
    renderer_restarts: 1,
  });
  client.terminateNow();
}

function testSecondCrashIsStableError() {
  const factory = fakeFactory((worker, message) => {
    respond(worker, message, PLOTLY_RENDERER_STATE_ERROR, {
      code: "SAGEJS_GRAPHICS_RENDER_FAILED",
      message: "browser disconnected",
      retryable: true,
    });
  });
  const client = renderer(factory);
  assertCode("SAGEJS_GRAPHICS_RENDER_FAILED", () => client.render("{}"));
  assert.equal(factory.workers.length, 2);
  assert.equal(client.stats().renderer_restarts, 1);
}

function testLimits() {
  const unused = fakeFactory(() => {});
  const client = renderer(unused, { maxRequestBytes: 4 });
  assertCode("SAGEJS_GRAPHICS_EXPORT_LIMIT", () => client.render("12345"));
  assert.equal(unused.workers.length, 0);

  const outputLimit = fakeFactory((worker, message) => {
    respond(worker, message, PLOTLY_RENDERER_STATE_ERROR, {
      code: "SAGEJS_GRAPHICS_EXPORT_LIMIT",
      message: "bounded output limit",
      retryable: false,
    });
  });
  const outputClient = renderer(outputLimit);
  assertCode("SAGEJS_GRAPHICS_EXPORT_LIMIT", () => outputClient.render("{}"));
  outputClient.terminateNow();
}

function testBusy() {
  let client;
  let nestedError;
  const factory = fakeFactory((worker, message) => {
    try {
      client.render("{}");
    } catch (error) {
      nestedError = error;
    }
    respond(worker, message, PLOTLY_RENDERER_STATE_SUCCESS, PNG);
  });
  client = renderer(factory);
  assert.deepEqual(client.render("{}"), PNG);
  assert.equal(nestedError.code, "SAGEJS_GRAPHICS_RENDER_FAILED");
  assert.match(nestedError.message, /busy/);
  client.terminateNow();
}

function testDisposal() {
  const factory = fakeFactory((worker, message) => {
    respond(worker, message, PLOTLY_RENDERER_STATE_SUCCESS, PNG);
  });
  const client = renderer(factory);
  assert.deepEqual(client.render("{}"), PNG);
  client.dispose();
  assert.equal(factory.workers[0].messages.at(-1).type, "dispose");
  assert.equal(factory.workers[0].terminated, 1);
  client.dispose();
  assertCode("SAGEJS_GRAPHICS_RENDER_FAILED", () => client.render("{}"));
}

testReuseAndConfiguration();
testTimeoutAndHardExitFallback();
testCrashRestartOnce();
testSecondCrashIsStableError();
testLimits();
testTinyResponseBuffer();
testBusy();
testDisposal();

console.log("Persistent graphics export worker tests passed");
