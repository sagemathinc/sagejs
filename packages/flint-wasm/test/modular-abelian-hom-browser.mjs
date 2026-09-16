import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { createBrowserWasmServer, executablePathFor } from "./browser-wasm-support.mjs";
const executablePath=executablePathFor("chromium",chromium);
assert.ok(executablePath,"Chromium is required for Hom parity");
const server=await createBrowserWasmServer();
let browser;
try {
  browser=await chromium.launch({executablePath,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage();
  await page.goto(`${server.origin}/browser-wasm-harness.html`);
  await page.waitForFunction(()=>window.__sagejsReady!==undefined);
  await page.evaluate(()=>window.__sagejsReady);
  const fixture=name=>readFileSync(new URL("../../../test/fixtures/"+name,import.meta.url),"utf8");
  const result=await page.evaluate(code=>window.__sagejsTest.evaluate(code,290000),fixture("modular-abelian-hom.py"));
  assert.equal(result.stdout.trim(),"certified Hom and End geometry passed");
  const oracle=JSON.parse(fixture("modular-abelian-hom-sage.json"));
  const code="import json\noracle=json.loads("+JSON.stringify(JSON.stringify(oracle))+")\n"+fixture("modular-abelian-hom-differential.py");
  const differential=await page.evaluate(code=>window.__sagejsTest.evaluate(code,290000),code);
  assert.match(differential.stdout,/connected quotient model lattices passed/);
  console.log("Complete Hom/End Chromium geometry and exact Sage lattice parity passed");
} finally {await browser?.close();await server.close();}
