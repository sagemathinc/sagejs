"use strict";

const { rmSync } = require("node:fs");
const { spawn } = require("node:child_process");

const WINDOWS_LOCK_ERRORS = new Set([
  "EACCES",
  "EBUSY",
  "ENOTEMPTY",
  "EPERM",
]);

// A native addon loaded with `require()` remains mapped until its Node process
// exits. Windows consequently refuses to unlink the `.node` file even after it
// disappears from the JavaScript require cache. A detached Node process can
// finish removing the test cache as soon as the test process releases the DLL.
const DEFERRED_CLEANER_SOURCE = String.raw`
"use strict";
const { rm } = require("node:fs");
const target = process.argv[1];
const parentPid = Number(process.argv[2]);
const deadline = Date.now() + 30 * 60 * 1000;
const locked = new Set(["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"]);

function parentIsAlive() {
  try {
    process.kill(parentPid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function remove() {
  rm(target, {
    recursive: true,
    force: true,
    maxRetries: 2,
    retryDelay: 50,
  }, (error) => {
    if (!error || error.code === "ENOENT") return;
    if (!locked.has(error.code) || Date.now() >= deadline) {
      process.exitCode = 1;
      return;
    }
    setTimeout(remove, 1000);
  });
}

function waitForParent() {
  if (!parentIsAlive() || Date.now() >= deadline) {
    remove();
    return;
  }
  setTimeout(waitForParent, 1000);
}

waitForParent();
`;

function removeLoadedNativeCache(directory, options = {}) {
  const platform = options.platform || process.platform;
  const remove = options.remove || rmSync;
  const spawnProcess = options.spawnProcess || spawn;
  try {
    remove(directory, {
      recursive: true,
      force: true,
      maxRetries: 2,
      retryDelay: 50,
    });
    return "removed";
  } catch (error) {
    if (
      platform !== "win32" ||
      !error ||
      !WINDOWS_LOCK_ERRORS.has(error.code)
    ) {
      throw error;
    }
  }

  const cleaner = spawnProcess(
    process.execPath,
    ["-e", DEFERRED_CLEANER_SOURCE, directory, String(process.pid)],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  // Failure to launch the best-effort janitor must not become an uncaught
  // EventEmitter error after an otherwise successful test has completed.
  cleaner.on?.("error", () => {});
  cleaner.unref();
  return "deferred";
}

module.exports = {
  removeLoadedNativeCache,
};
