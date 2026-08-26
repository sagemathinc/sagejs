#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createReadStream as openReadStream, createWriteStream as openWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { constants as zlibConstants, createBrotliCompress } from "node:zlib";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const RELEASE_PATTERN = /^[a-f0-9]{64}$/;
const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const PREVIEW_PATTERN = /^[a-z0-9][a-z0-9-]{0,38}$/;

const CONTENT_TYPES = new Map([
  [".c", "text/plain; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".json", "application/json; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ts", "text/plain; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filename) {
  const hash = createHash("sha256");
  for await (const chunk of openReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

function safeRelative(value) {
  if (typeof value !== "string" || value === "" || path.isAbsolute(value)) {
    throw new TypeError("deployment paths must be nonempty and relative");
  }
  const normalized = value.replaceAll("\\", "/");
  if (normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new TypeError(`unsafe deployment path ${JSON.stringify(value)}`);
  }
  return normalized;
}

async function collectFiles(root) {
  const files = [];
  async function visit(directory, relative) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(child, childRelative);
      else if (entry.isFile() && childRelative !== "_headers") files.push(childRelative);
      else if (!entry.isFile()) throw new Error(`deployment tree contains a non-file ${childRelative}`);
    }
  }
  await visit(root, "");
  return files.sort();
}

function contentType(filename) {
  const result = CONTENT_TYPES.get(path.extname(filename).toLowerCase());
  if (!result) throw new Error(`no reviewed content type for ${filename}`);
  return result;
}

function objectKey(logicalPath, release, encoding) {
  if (logicalPath.startsWith(`assets/sha256-`)) {
    if (!/^assets\/sha256-[a-f0-9]{64}\//.test(logicalPath)) {
      throw new Error(`asset path is not content addressed: ${logicalPath}`);
    }
    return `public/${encoding}/${logicalPath}`;
  }
  return `releases/${release}/${encoding}/${logicalPath}`;
}

function cacheControl(logicalPath) {
  return logicalPath.startsWith("assets/")
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

async function compressBrotli(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await pipeline(
    openReadStream(source),
    createBrotliCompress({
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: (await stat(source)).size,
      },
    }),
    openWriteStream(destination, { flags: "wx" }),
  );
}

function validatePublicOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("public origin must be an HTTPS origin without path, query, credentials, or fragment");
  }
  return url.origin;
}

function parseJson(contents, label) {
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

async function validateStagedIntegrity(siteRoot, assetManifest, runtimeVersion) {
  if (assetManifest.schema !== "org.sagejs.web/assets-v2" || !RELEASE_PATTERN.test(assetManifest.release)) {
    throw new Error("staged asset manifest has an invalid schema or release identity");
  }
  if (runtimeVersion.schema !== "org.sagejs.web/runtime-v1" ||
      runtimeVersion.artifactIdentity !== assetManifest.artifactIdentity) {
    throw new Error("runtime version and asset manifest identify different artifacts");
  }
  for (const record of assetManifest.assets ?? []) {
    const logical = record.path === "./" ? "index.html" : safeRelative(record.path.replace(/^\.\//, ""));
    const filename = path.join(siteRoot, logical);
    const information = await stat(filename);
    if (!information.isFile() || information.size !== record.bytes || await sha256File(filename) !== record.sha256) {
      throw new Error(`staged asset integrity mismatch for ${record.path}`);
    }
  }
}

export async function prepareCloudflareRelease({
  siteRoot = path.join(repositoryRoot, "website/live/dist"),
  outputRoot = path.join(repositoryRoot, "build/cloudflare-deploy"),
  workerEntrypoint = path.join(scriptDirectory, "worker.mjs"),
  target,
  previewName = "candidate",
  workerName,
  bucketName,
  publicOrigin,
} = {}) {
  if (target !== "preview" && target !== "production") throw new Error("target must be preview or production");
  if (!NAME_PATTERN.test(workerName ?? "") || workerName.length > 40) throw new Error("invalid Cloudflare Worker name");
  if (!BUCKET_PATTERN.test(bucketName ?? "")) throw new Error("invalid R2 bucket name");
  if (!PREVIEW_PATTERN.test(previewName)) throw new Error("invalid preview name");
  publicOrigin = validatePublicOrigin(publicOrigin);

  siteRoot = path.resolve(siteRoot);
  outputRoot = path.resolve(outputRoot);
  const [assetManifestContents, runtimeVersionContents] = await Promise.all([
    readFile(path.join(siteRoot, "asset-manifest.json"), "utf8"),
    readFile(path.join(siteRoot, "runtime-version.json"), "utf8"),
  ]);
  const assetManifest = parseJson(assetManifestContents, "asset-manifest.json");
  const runtimeVersion = parseJson(runtimeVersionContents, "runtime-version.json");
  await validateStagedIntegrity(siteRoot, assetManifest, runtimeVersion);
  const release = assetManifest.release;

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  const records = [];
  for (const logicalPath of await collectFiles(siteRoot)) {
    safeRelative(logicalPath);
    const source = path.join(siteRoot, logicalPath);
    const identityFile = path.join(outputRoot, "payload/identity", logicalPath);
    const brotliFile = path.join(outputRoot, "payload/br", logicalPath);
    await mkdir(path.dirname(identityFile), { recursive: true });
    await copyFile(source, identityFile, 0);
    await compressBrotli(source, brotliFile);
    const [identityInfo, brotliInfo, identitySha256, brotliSha256] = await Promise.all([
      stat(identityFile),
      stat(brotliFile),
      sha256File(identityFile),
      sha256File(brotliFile),
    ]);
    records.push({
      logicalPath,
      contentType: contentType(logicalPath),
      cacheControl: cacheControl(logicalPath),
      identity: {
        file: path.relative(outputRoot, identityFile).replaceAll(path.sep, "/"),
        key: objectKey(logicalPath, release, "identity"),
        bytes: identityInfo.size,
        sha256: identitySha256,
      },
      br: {
        file: path.relative(outputRoot, brotliFile).replaceAll(path.sep, "/"),
        key: objectKey(logicalPath, release, "br"),
        bytes: brotliInfo.size,
        sha256: brotliSha256,
      },
    });
  }

  const deployment = {
    schema: "org.sagejs.web/cloudflare-r2-release-v1",
    release,
    artifactIdentity: assetManifest.artifactIdentity,
    target,
    publicOrigin,
    bucketName,
    records,
    totals: {
      files: records.length,
      identityBytes: records.reduce((sum, record) => sum + record.identity.bytes, 0),
      brotliBytes: records.reduce((sum, record) => sum + record.br.bytes, 0),
    },
  };
  const deploymentContents = `${JSON.stringify(deployment, null, 2)}\n`;
  await writeFile(path.join(outputRoot, "deployment.json"), deploymentContents);
  await copyFile(workerEntrypoint, path.join(outputRoot, "worker.mjs"));

  const deployedWorkerName = target === "production"
    ? workerName
    : `${workerName}-preview-${previewName}-${release.slice(0, 12)}`;
  if (!NAME_PATTERN.test(deployedWorkerName)) throw new Error("generated preview Worker name is invalid");
  const wrangler = {
    $schema: "https://json.schemastore.org/wrangler.json",
    name: deployedWorkerName,
    main: "./worker.mjs",
    compatibility_date: "2026-08-22",
    compatibility_flags: ["brotli_content_encoding"],
    workers_dev: target === "preview",
    preview_urls: target === "preview",
    r2_buckets: [{ binding: "ASSETS", bucket_name: bucketName }],
    vars: { RELEASE_ID: release },
  };
  if (target === "production") {
    wrangler.routes = [{ pattern: new URL(publicOrigin).hostname, custom_domain: true }];
  }
  await writeFile(path.join(outputRoot, "wrangler.json"), `${JSON.stringify(wrangler, null, 2)}\n`);
  return { ...deployment, workerName: deployedWorkerName, deploymentSha256: sha256Buffer(deploymentContents) };
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) throw new Error(`invalid argument ${name ?? ""}`);
    result[name.slice(2)] = value;
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArguments(process.argv.slice(2));
  prepareCloudflareRelease({
    siteRoot: args.site,
    outputRoot: args.output,
    target: args.target,
    previewName: args["preview-name"],
    workerName: args["worker-name"],
    bucketName: args.bucket,
    publicOrigin: args["public-origin"],
  }).then(
    (result) => process.stdout.write(`${JSON.stringify({
      release: result.release,
      artifactIdentity: result.artifactIdentity,
      target: result.target,
      workerName: result.workerName,
      deploymentSha256: result.deploymentSha256,
      totals: result.totals,
    })}\n`),
    (error) => { console.error(error.stack ?? error); process.exitCode = 1; },
  );
}
