// sagejs-test-tier: specialized
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {chromium, firefox, webkit} from "playwright-core";
import {createBrowserWasmServer, executablePathFor, repositoryRoot}
  from "../../../packages/flint-wasm/test/browser-wasm-support.mjs";

const source = fs.readFileSync(path.join(repositoryRoot,"test/numerics/performance/json-leaves.py"),"utf8");
const server = await createBrowserWasmServer();
try {
  for (const [name, engine] of Object.entries({chromium,firefox,webkit})) {
    const executablePath = executablePathFor(name,engine);
    assert.ok(executablePath, `${name} must be installed; no passing skip`);
    const browser = await engine.launch({executablePath,headless:true,
      ...(name === "chromium" ? {args:["--no-sandbox","--disable-dev-shm-usage"]} : {})});
    try {
      const page = await browser.newPage(), errors = [];
      page.on("pageerror",error=>errors.push(String(error)));
      await page.addInitScript(()=>{window.__sagejsTestOptions={mode:"python"};});
      await page.goto(`${server.origin}/browser-wasm-harness.html`,{waitUntil:"load"});
      await page.waitForFunction(()=>window.__sagejsReady !== undefined);
      await page.evaluate(()=>window.__sagejsReady);
      const diagnostic = await page.evaluate(() => window.__sagejsTest.evaluate(
        'import math\nfrom sagejs.numerics import _json\nfrom sagejs.numerics.statistics import _core\nprint("JSON math is session math", _json.math is math)\nprint("Unchanged statistics math is session math", _core.math is math)\n',120000));
      console.log(name, diagnostic.stdout);
      const result = await page.evaluate(program=>window.__sagejsTest.evaluate(program,120000),source);
      assert.equal(result.stdout.trim(),"JSON leaves passed");
      assert.equal(result.stderr,"");
      assert.deepEqual(errors,[]);
      await page.evaluate(()=>window.__sagejsTest.close());
      console.log(`${name}: public numerical JSON ownership/validation corpus passed`);
    } finally {await browser.close();}
  }
} finally {await server.close();}
