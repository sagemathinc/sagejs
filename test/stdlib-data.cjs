// sagejs-test-tier: integration
"use strict";

// Focused compatibility vectors adapted from CPython's Lib/test/test_json,
// test_csv, test_base64, test_zlib, test_gzip, and test_hashlib suites.
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");
const {
  createKernelEvaluatorAsync,
} = require("../dist/tools/kernel-evaluator.js");

async function testDataModules() {
  const sandbox = mkdtempSync(join(tmpdir(), "sagejs-stdlib-data-"));
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate(
      [
        "import os, json, csv, io, base64, zlib, gzip, hashlib, sagejs.runtime as runtime",
        `os.chdir(${JSON.stringify(sandbox)})`,
        "value = {'big': 10**80, 'unicode': 'héllo', 'items': [True, None, 1.25]}",
        "encoded = json.dumps(value, sort_keys=True)",
        "print(json.loads(encoded) == value, json.loads(encoded)['big'] == 10**80)",
        "print(json.dumps('é'), json.dumps('é', ensure_ascii=False))",
        "canonical = {'z': [None, True, -(10**80), 'a\\nb'], 'a': {'n': 10**80, 'quote': '\"'}}",
        "canonical_text = json.dumps(canonical, sort_keys=True, separators=(',', ':'))",
        "print(canonical_text)",
        "readable_canonical_text = json.JSONEncoder(sort_keys=True, separators=(',', ':')).encode(canonical)",
        "print(runtime.canonical_json_exact(canonical) == canonical_text == readable_canonical_text)",
        "ascii_payload = {'ascii': ''.join(chr(code) for code in range(127))}",
        "print(runtime.canonical_json_exact(ascii_payload) == json.JSONEncoder(sort_keys=True, separators=(',', ':')).encode(ascii_payload))",
        "print(runtime.canonical_json_exact({'é': 1}) is None, runtime.canonical_json_exact({'x': 1.25}) is None, runtime.canonical_json_exact({1: 'x'}) is None)",
        "cycle = []; cycle.append(cycle)",
        "print(runtime.canonical_json_exact(cycle) is None)",
        "print(json.loads('[1, 2.5]', parse_int=lambda x: int(x)+10))",
        "print(json.loads('{\"a\":1,\"a\":2}', object_pairs_hook=list))",
        "try:",
        "    json.loads('{\"x\":}')",
        "except json.JSONDecodeError as error:",
        "    print(type(error).__name__, error.lineno, error.colno)",
        "with open('data.json', 'w') as output:",
        "    json.dump(value, output)",
        "print(json.load(open('data.json')) == value)",
        "table = io.StringIO()",
        "writer = csv.writer(table)",
        "writer.writerow(['a', 'b,c', 'say \"hi\"'])",
        "writer.writerow(['multi\\nline', 2, 3])",
        "print(list(csv.reader(io.StringIO(table.getvalue()))))",
        "mapping = io.StringIO()",
        "writer = csv.DictWriter(mapping, fieldnames=['x', 'y'])",
        "writer.writeheader()",
        "writer.writerow({'x': 1, 'y': 2})",
        "print(list(csv.DictReader(io.StringIO(mapping.getvalue()))))",
        "print(base64.b64encode(b'hello world'))",
        "print(base64.b64decode(b'aGVsbG8gd29ybGQ='))",
        "raw = bytes([0, 15, 251, 255])",
        "print(base64.b16decode(base64.b16encode(raw)) == raw)",
        "print(base64.b32decode(base64.b32encode(raw)) == raw)",
        "print(base64.urlsafe_b64decode(base64.urlsafe_b64encode(raw)) == raw)",
        "payload = b'abc123' * 1000",
        "print(zlib.decompress(zlib.compress(payload)) == payload)",
        "print(zlib.crc32(b'123456789'), zlib.adler32(b'Wikipedia'))",
        "print(gzip.decompress(gzip.compress(payload)) == payload)",
        "with gzip.open('data.txt.gz', 'wt') as output:",
        "    output.write('alpha\\nbeta\\n')",
        "print(gzip.open('data.txt.gz', 'rt').read() == 'alpha\\nbeta\\n')",
        "print(hashlib.sha256(b'abc').hexdigest())",
        "digest = hashlib.sha256()",
        "digest.update(b'a'); copy = digest.copy(); digest.update(b'bc'); copy.update(b'bc')",
        "print(digest.digest() == copy.digest())",
        "print(hashlib.file_digest(open('data.json', 'rb'), 'sha1').hexdigest() == hashlib.sha1(open('data.json', 'rb').read()).hexdigest())",
      ].join("\n"),
    );
    assert.equal(
      result.stdout.trim(),
      [
        "True True",
        '"\\u00e9" "é"',
        '{"a":{"n":100000000000000000000000000000000000000000000000000000000000000000000000000000000,"quote":"\\\""},"z":[null,true,-100000000000000000000000000000000000000000000000000000000000000000000000000000000,"a\\nb"]}',
        "True",
        "True",
        "True True True",
        "True",
        "[11, 2.5]",
        "[('a', 1), ('a', 2)]",
        "JSONDecodeError 1 6",
        "True",
        "[['a', 'b,c', 'say \"hi\"'], ['multi\\nline', '2', '3']]",
        "[{'x': '1', 'y': '2'}]",
        "b'aGVsbG8gd29ybGQ='",
        "b'hello world'",
        "True",
        "True",
        "True",
        "True",
        "3421780262 300286872",
        "True",
        "True",
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        "True",
        "True",
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
        "import gzip, hashlib",
        "for operation in [lambda: gzip.compress(b'x'), lambda: hashlib.sha256(b'x').digest()]:",
        "    try:",
        "        operation()",
        "    except NotImplementedError:",
        "        print('unavailable')",
      ].join("\n"),
    );
    assert.equal(output.join("").trim(), "unavailable\nunavailable");
  } finally {
    evaluator.close();
  }
}

testDataModules()
  .then(testUnavailableHost)
  .then(() => console.log("Sage.js data and compression stdlib passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
