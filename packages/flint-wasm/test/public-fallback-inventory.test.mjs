import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { auditPublicFallbacks } from "../scripts/audit-public-fallbacks.mjs";

test("portable-fallback inventory matches its reviewed snapshot", async () => {
  const expected = JSON.parse(await readFile(
    new URL("../../../architecture/wasm-public-fallback-audit.json", import.meta.url),
  ));
  assert.deepEqual(await auditPublicFallbacks(), expected);
});
