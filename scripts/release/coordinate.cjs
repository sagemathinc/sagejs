#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { runBufferedCommand } = require("../build-parallelism.cjs");

function quote(value, windows = false) {
  return `'${value.replaceAll("'", windows ? "''" : "'\\''")}'`;
}
function remoteCommand(host, candidate, stage) {
  const configuration = Buffer.from(JSON.stringify({ ...host, candidate, stage })).toString("base64");
  const program = `const c=JSON.parse(Buffer.from("${configuration}","base64").toString());` +
    `process.chdir(c.root);` +
    `if(require(require("node:path").join(c.root,"scripts/package-qualification/runtime.cjs")).targetForHost()!==c.target)throw Error("wrong host target");` +
    `const args=["exec","node","scripts/release/runner.cjs","--candidate",c.candidate];` +
    `if(c.stage)args.push("--stage",c.stage);` +
    `const r=require("node:child_process").spawnSync(process.platform==="win32"?"pnpm.cmd":"pnpm",args,` +
    `{cwd:c.root,env:{...process.env,...c.env},stdio:"inherit",shell:process.platform==="win32"});` +
    `if(r.error)throw r.error;process.exitCode=r.status===null?1:r.status;`;
  const windows = host.target === "windows-x64";
  return `${windows ? "& " : ""}${quote(host.node || "node", windows)} -e ${quote(program, windows)}`;
}
async function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!["--candidate", "--hosts", "--stage"].includes(argv[i]) || !argv[i + 1]) throw new Error("expected --candidate SHA --hosts FILE [--stage IDS]");
    options[argv[i].slice(2)] = argv[i + 1];
  }
  if (!/^[0-9a-f]{40}$/.test(options.candidate || "")) throw new Error("full candidate SHA required");
  if (options.stage && !/^[a-z,-]+$/.test(options.stage)) throw new Error("invalid stage list");
  const hosts = JSON.parse(fs.readFileSync(options.hosts, "utf8"));
  const targets = ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"];
  if (!Array.isArray(hosts) || hosts.length !== 4 || targets.some((target) => hosts.filter((h) => h.target === target).length !== 1)) {
    throw new Error("host configuration must name each of the four targets exactly once");
  }
  if (hosts.some((h) => !/^[a-zA-Z0-9_.-]+$/.test(h.host) || !h.root)) throw new Error("invalid SSH host or checkout");
  const directory = path.resolve("build/release-coordinator", options.candidate);
  fs.mkdirSync(directory, { recursive: true });
  // A host failure does not kill independent, useful qualification on other
  // machines. Each host is fail-fast and maintains its own exclusive lock.
  const results = await Promise.all(hosts.map(async (host) => {
    const filename = path.join(directory, `${host.target}-${Date.now()}.log`);
    const log = fs.openSync(filename, "wx");
    console.log(`[release] starting ${host.target} on ${host.host}; ${filename}`);
    try {
      const output = (chunk) => { fs.writeSync(log, chunk); process.stdout.write(`[${host.target}] ${chunk}`); };
      const result = await runBufferedCommand("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=20", host.host,
        remoteCommand(host, options.candidate, options.stage)], { capture: false, onStdout: output, onStderr: output });
      return { target: host.target, status: result.status, log: filename };
    } catch (error) { return { target: host.target, status: 1, error: error.message }; }
    finally { fs.closeSync(log); }
  }));
  fs.writeFileSync(path.join(directory, "last-run.json"), JSON.stringify({ candidate: options.candidate, stage: options.stage || "native", results }, null, 2));
  console.log(results);
  return results.some((result) => result.status !== 0) ? 1 : 0;
}
if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(error.stack); process.exitCode = 1;
});
module.exports = { remoteCommand, quote };
