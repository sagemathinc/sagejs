#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const types = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".webmanifest", "application/manifest+json"],
]);
const securityHeaders = {
  "Content-Security-Policy": "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function startStaticServer({ directory = root, host = "127.0.0.1", port = 0 } = {}) {
  directory = path.resolve(directory);
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      let relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      if (!relative || relative.endsWith("/")) relative += "index.html";
      const filename = path.resolve(directory, relative);
      if (!filename.startsWith(`${directory}${path.sep}`)) throw new Error("unsafe path");
      const information = await stat(filename);
      if (!information.isFile()) throw new Error("not a file");
      response.writeHead(200, {
        ...securityHeaders,
        "Content-Length": information.size,
        "Content-Type": types.get(path.extname(filename)) ?? "application/octet-stream",
        "Cache-Control": relative === "sw.js" || relative === "runtime-version.json" || relative === "asset-manifest.json" ? "no-cache" : relative.startsWith("assets/sha256-") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(filename).pipe(response);
    } catch {
      response.writeHead(404, { ...securityHeaders, "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startStaticServer({ port: Number(process.env.PORT ?? 4173) }).then((server) => {
    const address = server.address();
    process.stdout.write(`Sage.js live preview: http://${address.address}:${address.port}/\n`);
  }, (error) => { console.error(error.stack ?? error); process.exitCode = 1; });
}
