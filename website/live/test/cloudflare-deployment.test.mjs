import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { brotliDecompress } from "node:zlib";
import { promisify } from "node:util";
import {
  handleRequest,
  logicalAssetPath,
  storageKey,
} from "../cloudflare/worker.mjs";
import { prepareCloudflareRelease } from "../cloudflare/prepare-release.mjs";
import {
  curlUploadConfiguration,
  uploadRelease,
  validateDeployment,
} from "../cloudflare/upload-r2.mjs";

const release = "a".repeat(64);
const decompressBrotli = promisify(brotliDecompress);

function object(body, contentType = "application/octet-stream") {
  return {
    body,
    httpEtag: `"${createHash("sha256").update(body).digest("hex")}"`,
    writeHttpMetadata(headers) {
      headers.set("Content-Type", contentType);
    },
  };
}

function cloudflareRequest(url, clientAcceptEncoding) {
  const request = new Request(url, { headers: { "Accept-Encoding": "br, gzip" } });
  Object.defineProperty(request, "cf", {
    value: Object.freeze({ clientAcceptEncoding }),
  });
  return request;
}

test("Cloudflare Worker maps immutable and release shell objects without path escape", async () => {
  assert.equal(logicalAssetPath(new Request("https://app.sagejs.org/")), "index.html");
  assert.equal(
    storageKey(`assets/sha256-${"b".repeat(64)}/runtime.wasm`, release, "br"),
    `public/br/assets/sha256-${"b".repeat(64)}/runtime.wasm`,
  );
  assert.equal(storageKey("index.html", release), `releases/${release}/identity/index.html`);
  assert.equal(
    storageKey(`assets/sha256-${"b".repeat(64)}/runtime.wasm`, "e".repeat(64), "br"),
    `public/br/assets/sha256-${"b".repeat(64)}/runtime.wasm`,
    "content-addressed assets remain addressable after release rollback or upgrade",
  );
  assert.notEqual(
    storageKey("index.html", release),
    storageKey("index.html", "e".repeat(64)),
    "release shells remain immutable and independently selectable",
  );
  assert.throws(() => storageKey("index.html", "not-a-release"), /invalid release/);

  const seen = [];
  const bucket = {
    async get(key) {
      seen.push(key);
      if (key === `releases/${release}/br/index.html`) {
        return object("compressed-index", "text/html; charset=utf-8");
      }
      return null;
    },
  };
  const response = await handleRequest(
    cloudflareRequest("https://app.sagejs.org/?ignored=yes", "gzip, br"),
    { ASSETS: bucket, RELEASE_ID: release },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Encoding"), "br");
  assert.equal(response.headers.get("Cache-Control"), "no-cache");
  assert.equal(response.headers.get("Cross-Origin-Embedder-Policy"), "require-corp");
  assert.deepEqual(seen, [`releases/${release}/br/index.html`]);

  const unsafe = await handleRequest(
    new Request("https://app.sagejs.org/%5c..%5csecret"),
    { ASSETS: bucket, RELEASE_ID: release },
  );
  assert.equal(unsafe.status, 400);
  assert.equal((await unsafe.text()).trim(), "Invalid asset path");
});

test("Cloudflare Worker negotiates against the original client encoding", async () => {
  const keys = [];
  const bucket = {
    async get(key) {
      keys.push(key);
      if (key === `releases/${release}/identity/runtime-version.json`) {
        return object('{"identity":true}\n', "application/json; charset=utf-8");
      }
      if (key === `releases/${release}/br/runtime-version.json`) {
        return object("brotli bytes", "application/json; charset=utf-8");
      }
      return null;
    },
  };

  const identity = await handleRequest(
    cloudflareRequest("https://app.sagejs.org/runtime-version.json", "identity"),
    { ASSETS: bucket, RELEASE_ID: release },
  );
  assert.equal(identity.headers.get("Content-Encoding"), null);
  assert.equal(await identity.text(), '{"identity":true}\n');
  assert.deepEqual(keys, [`releases/${release}/identity/runtime-version.json`]);

  keys.length = 0;
  const compressed = await handleRequest(
    cloudflareRequest("https://app.sagejs.org/runtime-version.json", "gzip, br"),
    { ASSETS: bucket, RELEASE_ID: release },
  );
  assert.equal(compressed.headers.get("Content-Encoding"), "br");
  assert.equal(await compressed.text(), "brotli bytes");
  assert.deepEqual(keys, [`releases/${release}/br/runtime-version.json`]);

  keys.length = 0;
  const refused = await handleRequest(
    cloudflareRequest("https://app.sagejs.org/runtime-version.json", "gzip, br;q=0"),
    { ASSETS: bucket, RELEASE_ID: release },
  );
  assert.equal(refused.headers.get("Content-Encoding"), null);
  assert.deepEqual(keys, [`releases/${release}/identity/runtime-version.json`]);
});

test("Cloudflare Worker falls back to identity and fails closed", async () => {
  const assetPath = `assets/sha256-${"b".repeat(64)}/runtime.wasm`;
  const keys = [];
  const bucket = {
    async get(key) {
      keys.push(key);
      return key.includes("/identity/") ? object("wasm", "application/wasm") : null;
    },
  };
  const response = await handleRequest(
    new Request(`https://app.sagejs.org/${assetPath}`, { headers: { "Accept-Encoding": "br" } }),
    { ASSETS: bucket, RELEASE_ID: release },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Encoding"), null);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.deepEqual(keys, [
    `public/br/${assetPath}`,
    `public/identity/${assetPath}`,
  ]);

  assert.equal((await handleRequest(new Request("https://app.sagejs.org/", { method: "POST" }), {
    ASSETS: bucket,
    RELEASE_ID: release,
  })).status, 405);
  assert.equal((await handleRequest(new Request("https://app.sagejs.org/"), {
    ASSETS: bucket,
    RELEASE_ID: "bad",
  })).status, 503);
});

async function stagedFixture(root) {
  const site = path.join(root, "site");
  const artifact = `sha256:${"c".repeat(64)}`;
  const assetDirectory = `assets/sha256-${"c".repeat(64)}`;
  const contents = new Map([
    ["index.html", "<!doctype html><title>Sage.js</title>"],
    ["app.mjs", "export const answer = 42;\n"],
    [`${assetDirectory}/runtime.wasm`, Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])],
  ]);
  for (const [relative, value] of contents) {
    const filename = path.join(site, relative);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, value);
  }
  const assets = [];
  for (const [relative, value] of contents) {
    const buffer = Buffer.from(value);
    assets.push({
      path: relative === "index.html" ? "./" : `./${relative}`,
      bytes: buffer.length,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    });
  }
  await writeFile(path.join(site, "runtime-version.json"), `${JSON.stringify({
    schema: "org.sagejs.web/runtime-v1",
    artifactIdentity: artifact,
  })}\n`);
  await writeFile(path.join(site, "asset-manifest.json"), `${JSON.stringify({
    schema: "org.sagejs.web/assets-v2",
    release,
    artifactIdentity: artifact,
    assets,
  })}\n`);
  return site;
}

test("Cloudflare release preparation produces authenticated Brotli and identity objects", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "sagejs-cloudflare-"));
  try {
    const site = await stagedFixture(temporary);
    const output = path.join(temporary, "output");
    const result = await prepareCloudflareRelease({
      siteRoot: site,
      outputRoot: output,
      target: "production",
      workerName: "sagejs-app",
      bucketName: "sagejs",
      publicOrigin: "https://app.sagejs.org",
    });
    assert.equal(result.release, release);
    assert.ok(result.totals.identityBytes > result.totals.brotliBytes);
    const deployment = JSON.parse(await readFile(path.join(output, "deployment.json"), "utf8"));
    const wasm = deployment.records.find((record) => record.logicalPath.endsWith("runtime.wasm"));
    assert.match(wasm.identity.key, /^public\/identity\/assets\/sha256-/);
    assert.match(wasm.br.key, /^public\/br\/assets\/sha256-/);
    const index = deployment.records.find((record) => record.logicalPath === "index.html");
    assert.equal(index.identity.key, `releases/${release}/identity/index.html`);
    assert.deepEqual(
      await decompressBrotli(await readFile(path.join(output, index.br.file))),
      await readFile(path.join(output, index.identity.file)),
    );
    const wrangler = JSON.parse(await readFile(path.join(output, "wrangler.json"), "utf8"));
    assert.equal(wrangler.name, "sagejs-app");
    assert.equal(wrangler.workers_dev, false);
    assert.deepEqual(wrangler.compatibility_flags, ["brotli_content_encoding"]);
    assert.deepEqual(wrangler.routes, [{ pattern: "app.sagejs.org", custom_domain: true }]);
    assert.deepEqual(wrangler.r2_buckets, [{ binding: "ASSETS", bucket_name: "sagejs" }]);
    assert.equal(wrangler.vars.RELEASE_ID, release);

    assert.deepEqual(
      await uploadRelease({ deploymentFile: path.join(output, "deployment.json"), verifyOnly: true }),
      { release, objects: deployment.records.length * 2, uploaded: 0 },
    );
    await validateDeployment(path.join(output, "deployment.json"));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("R2 curl configuration signs uploads without placing credentials in command arguments", () => {
  const configuration = curlUploadConfiguration({
    accessKeyId: "access-key",
    secretAccessKey: "secret-key",
    url: "https://account.r2.cloudflarestorage.com/sagejs/object",
    filename: "/tmp/file with spaces",
    contentType: "application/wasm",
    contentEncoding: "br",
    cacheControl: "public, max-age=31536000, immutable",
    sha256: "d".repeat(64),
  });
  assert.match(configuration, /aws-sigv4 = "aws:amz:auto:s3"/);
  assert.match(configuration, /user = "access-key:secret-key"/);
  assert.match(configuration, /Content-Encoding: br/);
  assert.match(configuration, /x-amz-meta-sagejs-sha256/);
  assert.throws(() => curlUploadConfiguration({
    accessKeyId: "bad\nkey",
    secretAccessKey: "secret",
    url: "https://example.com",
    filename: "/tmp/file",
    contentType: "text/plain",
    cacheControl: "no-cache",
    sha256: "d".repeat(64),
  }), /unsafe curl/);
});
