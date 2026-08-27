// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, win32 } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  createKernelSpec,
  installKernelSpec,
  jupyterUserDataDirectory,
  kernelSpecDirectory,
  uninstallKernelSpec,
} = require("../dist/tools/jupyter-kernel.js");

test("npm and SEA launchers produce portable Jupyter kernelspecs", () => {
  assert.deepEqual(
    createKernelSpec("sage", ["/usr/bin/node", "/opt/sagejs/bin/sagejs-jupyter"]),
    {
      argv: [
        "/usr/bin/node",
        "/opt/sagejs/bin/sagejs-jupyter",
        "--connection-file",
        "{connection_file}",
        "--mode",
        "sage",
      ],
      display_name: "Sage.js Polyglot",
      language: "sage",
      interrupt_mode: "message",
      metadata: { debugger: false },
    },
  );
  assert.deepEqual(
    createKernelSpec("python", ["C:\\Sage.js\\sagejs.exe", "--jupyter-kernel"]),
    {
      argv: [
        "C:\\Sage.js\\sagejs.exe",
        "--jupyter-kernel",
        "--connection-file",
        "{connection_file}",
        "--mode",
        "python",
      ],
      display_name: "Sage.js (Python mode)",
      language: "python",
      interrupt_mode: "message",
      metadata: { debugger: false },
    },
  );
});

test("kernelspec installer rejects conflicting destinations", () => {
  assert.throws(
    () =>
      installKernelSpec(
        "sage",
        ["--user", "--sys-prefix"],
        ["/opt/sagejs/sagejs", "--jupyter-kernel"],
      ),
    /choose only one of --user, --sys-prefix, or --prefix/,
  );
});

test("user kernelspec paths match Jupyter defaults without invoking Jupyter", () => {
  assert.equal(
    jupyterUserDataDirectory({
      platform: "linux",
      home: "/home/ada",
      env: {},
    }),
    "/home/ada/.local/share/jupyter",
  );
  assert.equal(
    jupyterUserDataDirectory({
      platform: "linux",
      home: "/home/ada",
      env: { XDG_DATA_HOME: "/data/ada" },
    }),
    "/data/ada/jupyter",
  );
  assert.equal(
    jupyterUserDataDirectory({
      platform: "darwin",
      home: "/Users/ada",
      env: {},
    }),
    "/Users/ada/Library/Jupyter",
  );
  assert.equal(
    jupyterUserDataDirectory({
      platform: "darwin",
      home: "/Users/ada",
      env: { JUPYTER_PLATFORM_DIRS: "1" },
    }),
    "/Users/ada/Library/Application Support/jupyter",
  );
  assert.equal(
    jupyterUserDataDirectory({
      platform: "win32",
      home: "C:\\Users\\Ada",
      env: { APPDATA: "C:\\Users\\Ada\\AppData\\Roaming" },
    }),
    "C:\\Users\\Ada\\AppData\\Roaming\\jupyter",
  );
  assert.equal(
    jupyterUserDataDirectory({
      platform: "win32",
      home: "C:\\Users\\Ada",
      env: {
        JUPYTER_PLATFORM_DIRS: "true",
        LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local",
      },
    }),
    "C:\\Users\\Ada\\AppData\\Local\\jupyter",
  );
});

test("prefix and environment kernelspec destinations need no Python process", () => {
  assert.equal(
    kernelSpecDirectory("sage", ["--prefix", "/opt/math"], {
      platform: "linux",
      env: {},
    }),
    "/opt/math/share/jupyter/kernels/sagejs",
  );
  assert.equal(
    kernelSpecDirectory("python", ["--sys-prefix"], {
      platform: "win32",
      env: { CONDA_PREFIX: "C:\\Miniconda\\envs\\class" },
    }),
    win32.join(
      "C:\\Miniconda\\envs\\class",
      "share",
      "jupyter",
      "kernels",
      "sagejs-python",
    ),
  );
  assert.throws(
    () =>
      kernelSpecDirectory("sage", ["--sys-prefix"], {
        platform: "linux",
        env: {},
      }),
    /active conda or virtual environment.*--prefix PATH/,
  );
});

test("direct kernelspec installation replaces and removes its own directory", () => {
  const root = mkdtempSync(join(tmpdir(), "sagejs-direct-kernelspec-"));
  const messages = [];
  const options = {
    platform: process.platform,
    env: { JUPYTER_DATA_DIR: root, PATH: "" },
    output: (message) => messages.push(message),
  };
  try {
    const destination = installKernelSpec(
      "sage",
      [],
      ["/opt/sagejs/sagejs", "--jupyter-kernel"],
      options,
    );
    assert.equal(destination, join(root, "kernels", "sagejs"));
    const filename = join(destination, "kernel.json");
    assert.equal(existsSync(filename), true);
    assert.deepEqual(JSON.parse(readFileSync(filename, "utf8")), {
      argv: [
        "/opt/sagejs/sagejs",
        "--jupyter-kernel",
        "--connection-file",
        "{connection_file}",
        "--mode",
        "sage",
      ],
      display_name: "Sage.js Polyglot",
      language: "sage",
      interrupt_mode: "message",
      metadata: { debugger: false },
    });
    writeFileSync(join(destination, "obsolete-resource"), "old");
    installKernelSpec(
      "sage",
      [],
      ["/new/sagejs", "--jupyter-kernel"],
      options,
    );
    assert.equal(existsSync(join(destination, "obsolete-resource")), false);
    assert.equal(
      JSON.parse(readFileSync(filename, "utf8")).argv[0],
      "/new/sagejs",
    );
    assert.equal(uninstallKernelSpec("sage", [], options), true);
    assert.equal(existsSync(destination), false);
    assert.equal(uninstallKernelSpec("sage", [], options), false);
    assert.match(messages.join(""), /Restart or refresh your Jupyter client/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("direct kernelspec installation refuses a destination symlink", {
  skip: process.platform === "win32",
}, () => {
  const root = mkdtempSync(join(tmpdir(), "sagejs-kernelspec-symlink-"));
  const outside = mkdtempSync(join(tmpdir(), "sagejs-kernelspec-outside-"));
  try {
    const kernels = join(root, "kernels");
    mkdirSync(kernels, { recursive: true });
    symlinkSync(outside, join(kernels, "sagejs"));
    assert.throws(
      () =>
        installKernelSpec("sage", [], ["sagejs"], {
          env: { JUPYTER_DATA_DIR: root },
          output: () => undefined,
        }),
      /refusing to replace kernelspec symlink/,
    );
    assert.equal(existsSync(join(outside, "kernel.json")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("public installer and uninstaller work with an empty PATH", () => {
  const root = mkdtempSync(join(tmpdir(), "sagejs-public-kernelspec-"));
  const executable = join(__dirname, "..", "bin", "sagejs");
  const run = (...args) =>
    spawnSync(process.execPath, [executable, ...args], {
      encoding: "utf8",
      env: { ...process.env, JUPYTER_DATA_DIR: root, PATH: "" },
    });
  try {
    const installed = run("--install-jupyter-kernel");
    assert.equal(installed.status, 0, installed.stderr);
    assert.match(installed.stdout, /Installed Sage\.js Jupyter kernelspec/);
    assert.equal(
      existsSync(join(root, "kernels", "sagejs", "kernel.json")),
      true,
    );
    const removed = run("--uninstall-jupyter-kernel");
    assert.equal(removed.status, 0, removed.stderr);
    assert.match(removed.stdout, /Removed Sage\.js Jupyter kernelspec/);
    assert.equal(existsSync(join(root, "kernels", "sagejs")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
