"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  expectedStamp,
  igraphLtoSetting,
} = require("../scripts/build-deps.cjs");

test("igraph dependency archives contain portable non-LTO objects", () => {
  assert.equal(igraphLtoSetting("win32"), "OFF");
  assert.equal(igraphLtoSetting("linux"), "OFF");
  assert.equal(igraphLtoSetting("darwin"), "OFF");

  assert.deepEqual(JSON.parse(expectedStamp("win32")), {
    sha256: "969f2d7d22f67e788d8638c9a8c96615f50d7819c08978b3ef4a787bb6daa96c",
    lto: "OFF",
    platform: "win32",
  });
  assert.deepEqual(JSON.parse(expectedStamp("linux")), {
    sha256: "969f2d7d22f67e788d8638c9a8c96615f50d7819c08978b3ef4a787bb6daa96c",
    lto: "OFF",
    platform: "linux",
  });
  assert.equal(expectedStamp("win32").endsWith("\n"), true);
});
