"use strict";

/** Select the CPython executable used by repository tooling and oracles. */
function pythonExecutable({
  environment = process.env,
  platform = process.platform,
} = {}) {
  return (
    environment.SAGEJS_REFERENCE_PYTHON ||
    environment.PYTHON ||
    (platform === "win32" ? "python" : "python3")
  );
}

module.exports = { pythonExecutable };
