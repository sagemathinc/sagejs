"use strict";

// Focused compatibility vectors adapted from CPython's test_urllib,
// test_urllib2, test_httplib, and test_socket suites.
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");
const {
  createKernelEvaluator,
} = require("../dist/tools/kernel-evaluator.js");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function testNetworkModules() {
  const sandbox = mkdtempSync(join(tmpdir(), "sagejs-network-"));
  const web = http.createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "/final" });
      response.end();
      return;
    }
    if (request.url === "/missing") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not here");
      return;
    }
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "x-method": request.method,
        "x-request": request.headers["x-request"] || "",
      });
      response.end(request.url === "/final" ? "redirected" : body.length ? body : "hello\nworld\n");
    });
  });
  const echo = net.createServer((connection) => {
    connection.once("data", (data) => connection.write(data.toString().toUpperCase()));
  });
  const webPort = await listen(web);
  const echoPort = await listen(echo);
  const session = await createSage({ mode: "python" });
  try {
    const base = `http://127.0.0.1:${webPort}`;
    const result = await session.evaluate(
      [
        "import os, socket, urllib.parse, urllib.request, urllib.error, http.client",
        `os.chdir(${JSON.stringify(sandbox)})`,
        "parsed = urllib.parse.urlsplit('https://user:pass@example.com:8042/a/b?q=x+y#frag')",
        "print(parsed.scheme, parsed.hostname, parsed.port, parsed.username, parsed.password, parsed.path, parsed.query, parsed.fragment)",
        "print(urllib.parse.quote_plus('a b/é'))",
        "print(urllib.parse.unquote_plus('a+b%2Fc'))",
        "print(urllib.parse.urljoin('http://a/b/c/d;p?q', '../g'))",
        "print(urllib.parse.urlencode({'x': [1, 2], 'q': 'a b'}, doseq=True))",
        "print(urllib.parse.parse_qs('x=1&x=2&empty=', keep_blank_values=True))",
        `with urllib.request.urlopen(${JSON.stringify(base + "/lines")}) as response:`,
        "    print(response.status, response.headers.get_content_charset(), response.readline(), response.read())",
        `request = urllib.request.Request(${JSON.stringify(base + "/echo")}, data=b'payload', headers={'X-Request': 'yes'})`,
        "with urllib.request.urlopen(request) as response:",
        "    print(response.headers['x-method'], response.headers['x-request'], response.read())",
        `with urllib.request.urlopen(${JSON.stringify(base + "/redirect")}) as response:`,
        "    print(response.geturl().endswith('/final'), response.read())",
        "try:",
        `    urllib.request.urlopen(${JSON.stringify(base + "/missing")})`,
        "except urllib.error.HTTPError as error:",
        "    print(error.code, error.read())",
        `filename, headers = urllib.request.urlretrieve(${JSON.stringify(base + "/file")}, 'download.txt')`,
        "print(filename, headers.get_content_type(), open(filename).read().splitlines())",
        `connection = http.client.HTTPConnection('127.0.0.1', ${webPort})`,
        "connection.request('GET', '/client', headers={'X-Request': 'client'})",
        "response = connection.getresponse()",
        "print(response.status, response.getheader('x-request', 'missing') if hasattr(response, 'getheader') else response.headers.get('x-request'), response.read().splitlines())",
        "print(http.client.responses[200])",
        "print(socket.inet_ntoa(socket.inet_aton('127.0.0.1')))",
        "print(socket.gethostbyname('localhost') in ('127.0.0.1', '::1'))",
        `with socket.create_connection(('127.0.0.1', ${echoPort}), timeout=5) as client:`,
        "    client.sendall(b'sagejs')",
        "    print(client.recv(64))",
      ].join("\n"),
    );
    assert.equal(
      result.stdout.trim(),
      [
        "https example.com 8042 user pass /a/b q=x+y frag",
        "a+b%2F%C3%A9",
        "a b/c",
        "http://a/b/g",
        "x=1&x=2&q=a+b",
        "{'x': ['1', '2'], 'empty': ['']}",
        "200 utf-8 b'hello\\n' b'world\\n'",
        "POST yes b'payload'",
        "True b'redirected'",
        "404 b'not here'",
        "download.txt text/plain ['hello', 'world']",
        "200 client [b'hello', b'world']",
        "OK",
        "127.0.0.1",
        "True",
        "b'SAGEJS'",
      ].join("\n"),
    );
    assert.equal(readFileSync(join(sandbox, "download.txt"), "utf8"), "hello\nworld\n");
  } finally {
    await session.close();
    web.closeAllConnections();
    await Promise.all([close(echo), close(web)]);
    rmSync(sandbox, { recursive: true, force: true });
  }
}

function testUnavailableHost() {
  const output = [];
  const evaluator = createKernelEvaluator({
    mode: "python",
    onOutput: (text) => output.push(text),
  });
  Reflect.deleteProperty(globalThis, "__sagejs_host__");
  try {
    evaluator.evaluate(
      [
        "import socket, urllib.parse, urllib.request",
        "print(urllib.parse.urljoin('https://example/a/', '../b'))",
        "for operation in [lambda: socket.gethostbyname('localhost'), lambda: urllib.request.urlopen('https://example.com')]:",
        "    try:",
        "        operation()",
        "    except NotImplementedError:",
        "        print('unavailable')",
      ].join("\n"),
    );
    assert.equal(output.join("").trim(), "https://example/b\nunavailable\nunavailable");
  } finally {
    evaluator.close();
  }
}

testNetworkModules()
  .then(testUnavailableHost)
  .then(() => console.log("Sage.js network stdlib passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
