import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { createPrecompiledDynamicCompiler } from "../dynamic-compiler.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

test("portable dynamic programs use exact UTF-8 source and namespace identities", () => {
  const source = "answer = 'λ'\n";
  const filename = "<string>";
  const mode = "exec";
  const names = ["alpha", "missing"];
  const undefinedNames = ["missing"];
  const signature = sha256(JSON.stringify([names, undefinedNames]));
  const identity = "12".repeat(32);
  const compiler = createPrecompiledDynamicCompiler({
    schema: "sagejs.browser-dynamic-programs/v1",
    programs: [{
      identity,
      sourceHash: sha256(source),
      filename,
      mode,
      outputs: { [signature]: "compiled-javascript" },
    }],
  });
  const handle = compiler.compile(source, filename, mode);
  assert.deepEqual(compiler.run(handle, names, undefinedNames), {
    javascript: "compiled-javascript",
    moduleId: `__dynamic_${identity.slice(0, 24)}__`,
  });
  assert.throws(
    () => compiler.compile("answer = 42\n", filename, mode),
    /authenticated portable cache/,
  );
  assert.throws(
    () => compiler.run(handle, ["different"], []),
    /namespace shape.*authenticated portable cache/,
  );
});
