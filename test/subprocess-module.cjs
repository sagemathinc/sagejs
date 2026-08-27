// sagejs-test-tier: integration
"use strict";

// Focused compatibility vectors adapted from CPython's test_subprocess.
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");
const {
  createKernelEvaluatorAsync,
} = require("../dist/tools/kernel-evaluator.js");

async function testSubprocess() {
  const sandbox = mkdtempSync(join(tmpdir(), "sagejs-subprocess-"));
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate(
      [
        "import os, sys, subprocess",
        `os.chdir(${JSON.stringify(sandbox)})`,
        "command = [sys.executable, '-e', 'process.stdout.write(\"hello\"); process.stderr.write(\"error\")']",
        "result = subprocess.run(command, capture_output=True, text=True)",
        "print(result.returncode, result.stdout, result.stderr)",
        "print(result.check_returncode())",
        "result = subprocess.run([sys.executable, '-e', 'process.stdin.pipe(process.stdout)'], input=b'input bytes', stdout=subprocess.PIPE)",
        "print(result.stdout)",
        "result = subprocess.run([sys.executable, '-e', 'process.stdout.write(process.cwd()+\"|\"+process.env.SAGEJS_CHILD)'], cwd='.', env={'SAGEJS_CHILD': 'yes'}, stdout=subprocess.PIPE, text=True)",
        "print(result.stdout.endswith('|yes'))",
        "result = subprocess.run([sys.executable, '-e', 'process.stdout.write(\"out\"); process.stderr.write(\"err\")'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)",
        "print(sorted(result.stdout))",
        "try:",
        "    subprocess.run([sys.executable, '-e', 'process.exit(7)'], check=True)",
        "except subprocess.CalledProcessError as error:",
        "    print(error.returncode, error.cmd[0] == sys.executable)",
        "try:",
        "    subprocess.check_output([sys.executable, '-e', 'process.stdout.write(\"bad\"); process.exit(3)'])",
        "except subprocess.CalledProcessError as error:",
        "    print(error.returncode, error.output)",
        "process = subprocess.Popen([sys.executable, '-e', 'process.stdout.write(\"popen\")'], stdout=subprocess.PIPE, text=True)",
        "print(process.communicate(), process.poll(), process.wait(), process.stdout.read())",
        "try:",
        "    subprocess.run([sys.executable, '-e', 'setTimeout(()=>{}, 1000)'], timeout=0.02, capture_output=True)",
        "except subprocess.TimeoutExpired as error:",
        "    print(error.timeout)",
        "try:",
        "    subprocess.run(['sagejs-command-that-does-not-exist'])",
        "except FileNotFoundError as error:",
        "    print(type(error).__name__, os.path.basename(error.filename))",
      ].join("\n"),
    );
    assert.equal(
      result.stdout.trim(),
      [
        "0 hello error",
        "None",
        "b'input bytes'",
        "True",
        "['e', 'o', 'r', 'r', 't', 'u']",
        "7 True",
        "3 b'bad'",
        "('popen', None) 0 0 popen",
        "0.02",
        "FileNotFoundError sagejs-command-that-does-not-exist",
      ].join("\n"),
    );
  } finally {
    await session.close();
    rmSync(sandbox, { recursive: true, force: true });
  }
}

async function testUnavailableHost() {
  const output = [];
  const evaluator = await createKernelEvaluatorAsync({
    mode: "python",
    onOutput: (text) => output.push(text),
  });
  Reflect.deleteProperty(globalThis, "__sagejs_host__");
  try {
    evaluator.evaluate(
      [
        "import subprocess",
        "try:",
        "    subprocess.run(['anything'])",
        "except NotImplementedError:",
        "    print('unavailable')",
      ].join("\n"),
    );
    assert.equal(output.join("").trim(), "unavailable");
  } finally {
    evaluator.close();
  }
}

testSubprocess()
  .then(testUnavailableHost)
  .then(() => console.log("Sage.js subprocess stdlib passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
