#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const RELEASE_PATTERN = /^[a-f0-9]{64}$/;
const ACCOUNT_PATTERN = /^[a-f0-9]{32}$/;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

async function sha256File(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

function safeRelative(root, value) {
  if (typeof value !== "string" || !value || path.isAbsolute(value)) {
    throw new TypeError("upload file must be a nonempty relative path");
  }
  const resolved = path.resolve(root, value);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new TypeError("upload file escapes the release directory");
  return resolved;
}

function encodedObjectUrl(accountId, bucket, key) {
  const encoded = [bucket, ...key.split("/")].map(encodeURIComponent).join("/");
  return `https://${accountId}.r2.cloudflarestorage.com/${encoded}`;
}

function curlQuoted(value) {
  if (typeof value !== "string" || /[\r\n\0]/.test(value)) throw new TypeError("unsafe curl configuration value");
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function curlUploadConfiguration({
  accessKeyId,
  secretAccessKey,
  url,
  filename,
  contentType,
  contentEncoding,
  cacheControl,
  sha256,
}) {
  const lines = [
    `aws-sigv4 = ${curlQuoted("aws:amz:auto:s3")}`,
    `user = ${curlQuoted(`${accessKeyId}:${secretAccessKey}`)}`,
    `upload-file = ${curlQuoted(filename)}`,
    `url = ${curlQuoted(url)}`,
    `header = ${curlQuoted(`Content-Type: ${contentType}`)}`,
    `header = ${curlQuoted(`Cache-Control: ${cacheControl}`)}`,
    `header = ${curlQuoted(`x-amz-meta-sagejs-sha256: ${sha256}`)}`,
    `header = ${curlQuoted("Expect:")}`,
  ];
  if (contentEncoding) lines.push(`header = ${curlQuoted(`Content-Encoding: ${contentEncoding}`)}`);
  return `${lines.join("\n")}\n`;
}

export async function validateDeployment(deploymentFile) {
  deploymentFile = path.resolve(deploymentFile);
  const root = path.dirname(deploymentFile);
  const deployment = JSON.parse(await readFile(deploymentFile, "utf8"));
  if (deployment.schema !== "org.sagejs.web/cloudflare-r2-release-v1" ||
      !RELEASE_PATTERN.test(deployment.release) ||
      !BUCKET_PATTERN.test(deployment.bucketName ?? "") ||
      !Array.isArray(deployment.records) || deployment.records.length === 0) {
    throw new Error("invalid Cloudflare R2 deployment manifest");
  }
  const objects = [];
  const keys = new Set();
  for (const record of deployment.records) {
    if (typeof record.logicalPath !== "string" || !record.contentType || !record.cacheControl) {
      throw new Error("invalid deployment asset record");
    }
    for (const [encoding, variant] of [["identity", record.identity], ["br", record.br]]) {
      if (!variant || typeof variant.key !== "string" || !/^[a-f0-9]{64}$/.test(variant.sha256) ||
          !Number.isSafeInteger(variant.bytes) || variant.bytes < 0) {
        throw new Error(`invalid ${encoding} record for ${record.logicalPath}`);
      }
      if (keys.has(variant.key)) throw new Error(`duplicate R2 object key ${variant.key}`);
      keys.add(variant.key);
      const filename = safeRelative(root, variant.file);
      const information = await stat(filename);
      if (!information.isFile() || information.size !== variant.bytes || await sha256File(filename) !== variant.sha256) {
        throw new Error(`prepared upload integrity mismatch for ${variant.file}`);
      }
      objects.push({
        filename,
        key: variant.key,
        contentType: record.contentType,
        contentEncoding: encoding === "br" ? "br" : null,
        cacheControl: record.cacheControl,
        sha256: variant.sha256,
      });
    }
  }
  return { deployment, objects };
}

async function uploadWithCurl(object, credentials) {
  const configuration = curlUploadConfiguration({
    ...credentials,
    ...object,
    url: encodedObjectUrl(credentials.accountId, credentials.bucketName, object.key),
  });
  await new Promise((resolve, reject) => {
    const child = spawn("curl", [
      "--silent",
      "--show-error",
      "--fail-with-body",
      "--retry", "5",
      "--retry-all-errors",
      "--request", "PUT",
      "--config", "-",
    ], { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`R2 upload failed for ${object.key}: ${stderr.trim() || `curl exited ${code}`}`));
    });
    child.stdin.end(configuration);
  });
}

function headConfiguration({ accessKeyId, secretAccessKey, url }) {
  return [
    `aws-sigv4 = ${curlQuoted("aws:amz:auto:s3")}`,
    `user = ${curlQuoted(`${accessKeyId}:${secretAccessKey}`)}`,
    `url = ${curlQuoted(url)}`,
    "",
  ].join("\n");
}

function parseResponseHeaders(contents) {
  const blocks = contents.split(/\r?\n\r?\n/).filter((block) => /^HTTP\//.test(block));
  const block = blocks.at(-1);
  if (!block) throw new Error("R2 HEAD response did not contain HTTP headers");
  const lines = block.split(/\r?\n/);
  if (!/^HTTP\/\S+ 200(?: |$)/.test(lines.shift())) throw new Error("R2 HEAD response was not successful");
  const headers = new Map();
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator > 0) headers.set(line.slice(0, separator).toLowerCase(), line.slice(separator + 1).trim());
  }
  return headers;
}

async function verifyWithCurl(object, credentials) {
  const url = encodedObjectUrl(credentials.accountId, credentials.bucketName, object.key);
  const configuration = headConfiguration({ ...credentials, url });
  const stdout = await new Promise((resolve, reject) => {
    const child = spawn("curl", [
      "--silent",
      "--show-error",
      "--fail-with-body",
      "--retry", "5",
      "--retry-all-errors",
      "--head",
      "--config", "-",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`R2 verification failed for ${object.key}: ${stderr.trim() || `curl exited ${code}`}`));
    });
    child.stdin.end(configuration);
  });
  const headers = parseResponseHeaders(stdout);
  const expected = new Map([
    ["content-length", String((await stat(object.filename)).size)],
    ["content-type", object.contentType],
    ["cache-control", object.cacheControl],
    ["x-amz-meta-sagejs-sha256", object.sha256],
  ]);
  if (object.contentEncoding) expected.set("content-encoding", object.contentEncoding);
  for (const [name, value] of expected) {
    if (headers.get(name) !== value) {
      throw new Error(`R2 metadata mismatch for ${object.key}: expected ${name}=${JSON.stringify(value)}`);
    }
  }
}

async function concurrentMap(items, limit, callback) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await callback(items[index], index);
    }
  });
  await Promise.all(workers);
}

export async function uploadRelease({ deploymentFile, env = process.env, verifyOnly = false } = {}) {
  const { deployment, objects } = await validateDeployment(deploymentFile);
  if (verifyOnly) return { release: deployment.release, objects: objects.length, uploaded: 0 };
  const credentials = {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    bucketName: env.R2_BUCKET_NAME,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
  if (!ACCOUNT_PATTERN.test(credentials.accountId ?? "")) throw new Error("invalid CLOUDFLARE_ACCOUNT_ID");
  if (credentials.bucketName !== deployment.bucketName) throw new Error("R2 bucket differs from the prepared release");
  if (!credentials.accessKeyId || !credentials.secretAccessKey) throw new Error("R2 S3 credentials are missing");
  const concurrency = Number(env.SAGEJS_R2_UPLOAD_CONCURRENCY ?? "8");
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error("SAGEJS_R2_UPLOAD_CONCURRENCY must be an integer from 1 through 16");
  }
  await concurrentMap(objects, concurrency, (object) => uploadWithCurl(object, credentials));

  const deploymentContents = await readFile(path.resolve(deploymentFile));
  const auditFile = path.resolve(deploymentFile);
  const auditObject = {
    filename: auditFile,
    key: `releases/${deployment.release}/deployment.json`,
    contentType: "application/json; charset=utf-8",
    contentEncoding: null,
    cacheControl: "no-cache",
    sha256: createHash("sha256").update(deploymentContents).digest("hex"),
  };
  await uploadWithCurl(auditObject, credentials);
  const published = [...objects, auditObject];
  await concurrentMap(published, concurrency, (object) => verifyWithCurl(object, credentials));
  return {
    release: deployment.release,
    objects: published.length,
    uploaded: published.length,
    verified: published.length,
  };
}

function parseArguments(argv) {
  const result = { verifyOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--verify-only") result.verifyOnly = true;
    else if (argv[index] === "--deployment") result.deploymentFile = argv[++index];
    else throw new Error(`unknown argument ${argv[index]}`);
  }
  if (!result.deploymentFile) throw new Error("--deployment is required");
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  uploadRelease(options).then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => { console.error(error.stack ?? error); process.exitCode = 1; },
  );
}
