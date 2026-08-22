#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { loadToolchainLock, platformKey } = require("./wasm-toolchain.cjs");

const ACCOUNT_PATTERN = /^[a-f0-9]{32}$/;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

async function sha256File(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

function mirrorObjects(lock = loadToolchainLock(), { allPlatforms = false, platform = platformKey() } = {}) {
  return lock.sourceMirror.objects.filter(
    (object) => allPlatforms || object.platform === undefined || object.platform === platform,
  );
}

function mirrorFilename(root, object) {
  return path.join(path.resolve(root), object.sha256, object.filename);
}

function objectKey(lock, object) {
  return `${lock.sourceMirror.r2Prefix}/sha256/${object.sha256}/${object.filename}`;
}

function encodedObjectUrl(accountId, bucket, key) {
  return `https://${accountId}.r2.cloudflarestorage.com/` +
    [bucket, ...key.split("/")].map(encodeURIComponent).join("/");
}

function curlQuoted(value) {
  if (typeof value !== "string" || /[\r\n\0]/.test(value)) {
    throw new TypeError("unsafe curl configuration value");
  }
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function run(command, arguments_, { cwd, stdin, capture = false } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd,
      stdio: [stdin === undefined ? "ignore" : "pipe", capture ? "pipe" : "inherit", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
    }
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} failed: ${stderr.trim() || `exit ${code}`}`));
    });
    if (stdin !== undefined) child.stdin.end(stdin);
  });
}

async function verifyFile(filename, object) {
  const information = await stat(filename);
  if (!information.isFile()) throw new Error(`${object.id} is not a regular file`);
  const actual = await sha256File(filename);
  if (actual !== object.sha256) {
    throw new Error(`${object.id} source digest ${actual} != ${object.sha256}`);
  }
  return information.size;
}

async function downloadUrl(url, filename) {
  const temporary = `${filename}.download`;
  await run("curl", [
    "--silent",
    "--show-error",
    "--fail-with-body",
    "--location",
    "--retry", "5",
    "--retry-all-errors",
    "--connect-timeout", "30",
    "--output", temporary,
    url,
  ]);
  await rename(temporary, filename);
}

async function createCowasmBundle({ checkout, destination, lock }) {
  if (!checkout) throw new Error("--cowasm-checkout is required to stage the pinned CoWasm bundle");
  const revision = lock.cowasm.revision;
  await run("git", ["cat-file", "-e", `${revision}^{commit}`], { cwd: checkout });
  const bare = await mkdtemp(path.join(tmpdir(), "sagejs-cowasm-source-bundle-"));
  try {
    await run("git", ["init", "--bare", "--quiet"], { cwd: bare });
    await run(
      "git",
      ["fetch", "--quiet", path.resolve(checkout), `${revision}:refs/heads/toolchain`],
      { cwd: bare },
    );
    await rm(destination, { force: true });
    await run("git", ["bundle", "create", destination, "refs/heads/toolchain"], { cwd: bare });
  } finally {
    await rm(bare, { recursive: true, force: true });
  }
}

export async function stageSourceMirror({
  output,
  cowasmCheckout,
  cowasmBundle,
  allPlatforms = true,
  platform,
} = {}) {
  if (!output) throw new Error("--output is required");
  const lock = loadToolchainLock();
  const objects = mirrorObjects(lock, { allPlatforms, platform });
  const staged = [];
  for (const object of objects) {
    const filename = mirrorFilename(output, object);
    await mkdir(path.dirname(filename), { recursive: true });
    try {
      staged.push({ ...object, bytes: await verifyFile(filename, object) });
      continue;
    } catch {}
    if (object.kind === "git-bundle") {
      if (cowasmBundle) await copyFile(path.resolve(cowasmBundle), filename);
      else await createCowasmBundle({ checkout: cowasmCheckout, destination: filename, lock });
      const heads = await run("git", ["bundle", "list-heads", filename], { capture: true });
      if (!heads.split(/\r?\n/).includes(`${lock.cowasm.revision} refs/heads/toolchain`)) {
        throw new Error("the staged CoWasm bundle lacks the canonical locked toolchain ref");
      }
    } else {
      let lastError;
      for (const url of object.upstreamUrls ?? []) {
        try {
          await downloadUrl(url, filename);
          await verifyFile(filename, object);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = new Error(`unable to stage ${object.id} from ${url}: ${error.message}`);
        }
      }
      if (lastError) throw lastError;
    }
    staged.push({ ...object, bytes: await verifyFile(filename, object) });
  }
  return { objects: staged, root: path.resolve(output) };
}

function credentials(env = process.env) {
  const result = {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    bucket: env.R2_BUCKET_NAME,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
  if (!ACCOUNT_PATTERN.test(result.accountId ?? "")) throw new Error("invalid CLOUDFLARE_ACCOUNT_ID");
  if (!BUCKET_PATTERN.test(result.bucket ?? "")) throw new Error("invalid R2_BUCKET_NAME");
  if (!result.accessKeyId || !result.secretAccessKey) throw new Error("R2 S3 credentials are missing");
  return result;
}

function signedConfiguration({ credentials: value, url, output, upload, sha256 }) {
  const lines = [
    `aws-sigv4 = ${curlQuoted("aws:amz:auto:s3")}`,
    `user = ${curlQuoted(`${value.accessKeyId}:${value.secretAccessKey}`)}`,
    `url = ${curlQuoted(url)}`,
  ];
  if (output) lines.push(`output = ${curlQuoted(output)}`);
  if (upload) {
    lines.push(
      `upload-file = ${curlQuoted(upload)}`,
      `header = ${curlQuoted("Content-Type: application/octet-stream")}`,
      `header = ${curlQuoted("Cache-Control: public, max-age=31536000, immutable")}`,
      `header = ${curlQuoted(`x-amz-meta-sagejs-sha256: ${sha256}`)}`,
      `header = ${curlQuoted("Expect:")}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

async function signedCurl({ value, url, output, upload, head = false, sha256 }) {
  const configuration = signedConfiguration({
    credentials: value,
    url,
    output,
    upload,
    sha256,
  });
  return await run("curl", [
    "--silent",
    "--show-error",
    "--fail-with-body",
    "--retry", "5",
    "--retry-all-errors",
    ...(upload ? ["--request", "PUT"] : []),
    ...(head ? ["--head"] : []),
    "--config", "-",
  ], { stdin: configuration, capture: head });
}

function parseHeaders(contents) {
  const blocks = contents.split(/\r?\n\r?\n/).filter((block) => /^HTTP\//.test(block));
  const lines = blocks.at(-1)?.split(/\r?\n/) ?? [];
  if (!/^HTTP\/\S+ 200(?: |$)/.test(lines.shift() ?? "")) {
    throw new Error("R2 source mirror HEAD was not successful");
  }
  const headers = new Map();
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator > 0) headers.set(line.slice(0, separator).toLowerCase(), line.slice(separator + 1).trim());
  }
  return headers;
}

async function verifyRemote({ lock, object, value, bytes }) {
  const url = encodedObjectUrl(value.accountId, value.bucket, objectKey(lock, object));
  const headers = parseHeaders(await signedCurl({ value, url, head: true }));
  if (headers.get("content-length") !== String(bytes) ||
      headers.get("x-amz-meta-sagejs-sha256") !== object.sha256) {
    throw new Error(`R2 source mirror metadata mismatch for ${object.id}`);
  }
}

export async function uploadSourceMirror({ input, env = process.env, allPlatforms = true, platform } = {}) {
  if (!input) throw new Error("--input is required");
  const lock = loadToolchainLock();
  const value = credentials(env);
  const uploaded = [];
  for (const object of mirrorObjects(lock, { allPlatforms, platform })) {
    const filename = mirrorFilename(input, object);
    const bytes = await verifyFile(filename, object);
    const url = encodedObjectUrl(value.accountId, value.bucket, objectKey(lock, object));
    let alreadyPresent = false;
    try {
      await verifyRemote({ lock, object, value, bytes });
      alreadyPresent = true;
    } catch {}
    if (!alreadyPresent) {
      await signedCurl({ value, url, upload: filename, sha256: object.sha256 });
    }
    await verifyRemote({ lock, object, value, bytes });
    uploaded.push({
      id: object.id,
      key: objectKey(lock, object),
      bytes,
      sha256: object.sha256,
      uploaded: !alreadyPresent,
    });
  }
  return { objects: uploaded };
}

export async function fetchSourceMirror({ output, env = process.env, allPlatforms = false, platform } = {}) {
  if (!output) throw new Error("--output is required");
  const lock = loadToolchainLock();
  const value = credentials(env);
  const fetched = [];
  for (const object of mirrorObjects(lock, { allPlatforms, platform })) {
    const filename = mirrorFilename(output, object);
    await mkdir(path.dirname(filename), { recursive: true });
    let bytes;
    try {
      bytes = await verifyFile(filename, object);
    } catch {
      const temporary = `${filename}.download`;
      const url = encodedObjectUrl(value.accountId, value.bucket, objectKey(lock, object));
      await signedCurl({ value, url, output: temporary });
      await verifyFile(temporary, object);
      await rename(temporary, filename);
      bytes = await verifyFile(filename, object);
    }
    fetched.push({ id: object.id, bytes, sha256: object.sha256 });
  }
  return { objects: fetched, root: path.resolve(output), platform: platform ?? platformKey() };
}

export async function sourceArchiveEnvironment({
  input,
  allPlatforms = false,
  platform,
  lock = loadToolchainLock(),
} = {}) {
  if (!input) throw new Error("--input is required");
  const environment = {};
  for (const object of mirrorObjects(lock, { allPlatforms, platform })) {
    if (!object.archiveEnvironment) continue;
    if (!/^SAGEJS_[A-Z0-9_]+_TARBALL$/.test(object.archiveEnvironment)) {
      throw new Error(`unsafe archive environment name for ${object.id}`);
    }
    const filename = mirrorFilename(input, object);
    await verifyFile(filename, object);
    if (environment[object.archiveEnvironment]) {
      throw new Error(`duplicate archive environment ${object.archiveEnvironment}`);
    }
    environment[object.archiveEnvironment] = filename;
  }
  return environment;
}

export async function seedCowasmSources({ mirrorRoot, cowasmRoot, environment = process.env } = {}) {
  if (!mirrorRoot || !cowasmRoot) throw new Error("mirrorRoot and cowasmRoot are required");
  const lock = loadToolchainLock();
  for (const object of mirrorObjects(lock)) {
    const source = mirrorFilename(mirrorRoot, object);
    await verifyFile(source, object);
    if (object.cowasmTarget) {
      const destination = path.resolve(cowasmRoot, ...object.cowasmTarget.split("/"));
      if (!destination.startsWith(`${path.resolve(cowasmRoot)}${path.sep}`)) {
        throw new Error(`unsafe CoWasm mirror target for ${object.id}`);
      }
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }
    if (object.archiveEnvironment) environment[object.archiveEnvironment] = source;
  }
}

function parseArguments(argv) {
  const result = { allPlatforms: false };
  const command = argv.shift();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") result.output = argv[++index];
    else if (argument === "--input") result.input = argv[++index];
    else if (argument === "--cowasm-checkout") result.cowasmCheckout = argv[++index];
    else if (argument === "--cowasm-bundle") result.cowasmBundle = argv[++index];
    else if (argument === "--platform") result.platform = argv[++index];
    else if (argument === "--all-platforms") result.allPlatforms = true;
    else throw new Error(`unknown argument ${argument}`);
  }
  return { command, options: result };
}

async function main(argv) {
  const { command, options } = parseArguments([...argv]);
  let result;
  if (command === "stage") result = await stageSourceMirror({ ...options, allPlatforms: options.allPlatforms });
  else if (command === "upload") result = await uploadSourceMirror(options);
  else if (command === "fetch") result = await fetchSourceMirror(options);
  else if (command === "environment") {
    result = await sourceArchiveEnvironment(options);
    for (const [name, filename] of Object.entries(result).sort(([left], [right]) => left.localeCompare(right))) {
      process.stdout.write(`${name}=${filename}\n`);
    }
    return;
  } else throw new Error("usage: source-mirror.mjs stage|upload|fetch|environment [options]");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  });
}
