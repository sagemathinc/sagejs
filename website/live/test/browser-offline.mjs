import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXAMPLES } from "../examples.mjs";
import { stageRelease } from "../scripts/stage.mjs";
import { startStaticServer } from "../scripts/static-server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromium = [process.env.SAGEJS_CHROMIUM, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].filter(Boolean).find(existsSync);
assert.ok(chromium, "Chromium not found; set SAGEJS_CHROMIUM");

const uploadDirectory = mkdtempSync(path.join(tmpdir(), "sagejs-widget-upload-"));
const uploadName = "sagejs-upload.txt";
const uploadContents = "Sage.js upload\n";
const uploadBytes = Buffer.from(uploadContents);
const uploadPath = path.join(uploadDirectory, uploadName);
writeFileSync(uploadPath, uploadBytes);

const staged = await stageRelease({ appRoot: root });
const server = await startStaticServer({ directory: staged.target });
const { port } = server.address();
const chrome = spawn(chromium, ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=0", "about:blank"]);
let chromeErrors = "";

try {
  const debuggerUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chromium did not start:\n${chromeErrors}`)), 10_000);
    chrome.once("error", reject);
    chrome.stderr.on("data", (chunk) => {
      chromeErrors += chunk;
      const match = chromeErrors.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const targetUrl = new URL("/json/list", debuggerUrl); targetUrl.protocol = "http:";
  const page = (await (await fetch(targetUrl)).json()).find((entry) => entry.type === "page");
  assert.ok(page);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  const browserConsole = [];
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id !== undefined) {
      const handlers = pending.get(message.id); pending.delete(message.id);
      if (message.error) handlers?.reject(new Error(message.error.message));
      else handlers?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === "Runtime.consoleAPICalled") {
      browserConsole.push(message.params.args.map((arg) => arg.value ?? arg.description).join(" "));
    }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  await command("Runtime.enable"); await command("Network.enable"); await command("Page.enable");

  async function evaluate(expression) {
    const answer = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.text);
    return answer.result.value;
  }
  async function waitFor(expression, timeout = 90_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = await evaluate(expression);
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const snapshot = await evaluate(`JSON.stringify({
      kernel: document.querySelector('#kernel-status')?.textContent.trim(),
      kernelState: document.querySelector('#kernel-status')?.dataset.state,
      live: document.querySelector('#live-status')?.textContent,
      output: document.querySelector('#output')?.textContent,
      source: document.querySelector('#source')?.value,
      runDisabled: document.querySelector('[data-run="all"]')?.disabled,
      diagnostics: document.querySelector('#diagnostics')?.textContent,
      widgetInputs: Array.from(document.querySelectorAll('#output input'), (input) => ({
        type: input.type,
        value: input.value,
      })),
      widgetSliders: Array.from(document.querySelectorAll('#output [role=slider]'), (slider) => ({
        value: slider.getAttribute('aria-valuenow'),
      })),
    })`);
    throw new Error(`timed out waiting for ${expression}\npage snapshot: ${snapshot}\nbrowser console:\n${browserConsole.join("\n")}\n${errors.join("\n")}\n${chromeErrors}`);
  }
  async function runFactor({ setSource = true } = {}) {
    await evaluate(`${setSource ? "document.querySelector('#source').value='factor(2026)';" : ""} document.querySelector('[data-run="all"]').click()`);
    await waitFor(`document.querySelector('#output')?.textContent.includes('2 * 1013')`);
  }
  async function runSource(source, ready, timeout = 90_000) {
    await evaluate(`document.querySelector('#source').value=${JSON.stringify(source)}; document.querySelector('[data-run="all"]').click()`);
    await waitFor(ready, timeout);
  }
  async function runCellSource(source, ready, timeout = 90_000) {
    await evaluate(`(() => {
      const editor = document.querySelector('#source');
      editor.value = ${JSON.stringify(source)};
      editor.setSelectionRange(editor.value.length);
      document.querySelector('[data-run="cell"]').click();
    })()`);
    await waitFor(ready, timeout);
  }
  async function pressKey(key, code, windowsVirtualKeyCode) {
    await command("Input.dispatchKeyEvent", {
      type: "keyDown", key, code, windowsVirtualKeyCode,
    });
    await command("Input.dispatchKeyEvent", {
      type: "keyUp", key, code, windowsVirtualKeyCode,
    });
  }
  async function renderedPlotPixelStats() {
    return evaluate(`(async () => {
      const plot = document.querySelector('#output .plot');
      const source = await Plotly.toImage(plot, {
        format: 'png', width: 480, height: 360,
      });
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let chromatic = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        if (pixels[offset + 3] !== 0 && Math.max(red, green, blue) - Math.min(red, green, blue) > 20) {
          chromatic += 1;
        }
      }
      return { width: canvas.width, height: canvas.height, chromatic };
    })()`);
  }

  await command("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "dark" }],
  });
  await command("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  await waitFor(`document.querySelector('#kernel-status')?.dataset.state === 'ready'`);
  await waitFor("navigator.serviceWorker.controller !== null");
  await waitFor(
    "document.querySelector('#kernel-status')?.dataset.state === 'ready' && " +
      "document.querySelector('#source')?.dataset.editor === 'codemirror6'",
  );
  assert.equal(await evaluate("crossOriginIsolated"), true);
  assert.deepEqual(
    await evaluate("[document.documentElement.dataset.themePreference, document.documentElement.dataset.theme, document.querySelector('#theme').value]"),
    ["system", "dark", "system"],
  );
  assert.equal(
    await evaluate("document.querySelector('#source')?.dataset.editor"),
    "codemirror6",
  );
  await evaluate(`(() => {
    const source = document.querySelector('#source');
    source.value = 'def square(x):';
    source.setSelectionRange(source.value.length);
    source.querySelector('.cm-content').focus();
    return true;
  })()`);
  await command("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13,
  });
  await command("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13,
  });
  assert.equal(
    await evaluate("document.querySelector('#source').value"),
    "def square(x):\n    ",
  );
  assert.ok(
    await evaluate("document.querySelectorAll('#source .cm-line span').length > 0"),
    "Python syntax should be highlighted",
  );
  await command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "(",
    code: "Digit9",
    modifiers: 8,
    text: "(",
    unmodifiedText: "9",
    windowsVirtualKeyCode: 57,
  });
  await command("Input.dispatchKeyEvent", {
    type: "keyUp", key: "(", code: "Digit9", modifiers: 8,
    windowsVirtualKeyCode: 57,
  });
  assert.equal(
    await evaluate("document.querySelector('#source').value"),
    "def square(x):\n    ()",
  );
  await runSource(
    "show(matrix(QQ,2,[0,0,-1,1]))",
    "document.querySelector('#output .katex .mord') !== null",
  );
  assert.equal(
    await evaluate("document.querySelector('#output .result-input')?.dataset.editor"),
    "codemirror6-readonly",
  );
  assert.equal(
    await evaluate("getComputedStyle(document.querySelector('#source .cm-editor')).backgroundColor === getComputedStyle(document.querySelector('#output .result-input .cm-editor')).backgroundColor"),
    true,
    "editable and recorded CodeMirror views should share the dark theme",
  );
  const darkEditorBackground = await evaluate("getComputedStyle(document.querySelector('#source .cm-editor')).backgroundColor");
  await evaluate(`(() => {
    const theme = document.querySelector('#theme');
    theme.value = 'light';
    theme.dispatchEvent(new Event('change'));
  })()`);
  assert.deepEqual(
    await evaluate("[document.documentElement.dataset.themePreference, document.documentElement.dataset.theme]"),
    ["light", "light"],
  );
  assert.notEqual(
    await evaluate("getComputedStyle(document.querySelector('#source .cm-editor')).backgroundColor"),
    darkEditorBackground,
  );
  assert.equal(
    await evaluate("getComputedStyle(document.querySelector('#source .cm-editor')).backgroundColor === getComputedStyle(document.querySelector('#output .result-input .cm-editor')).backgroundColor"),
    true,
    "editable and recorded CodeMirror views should share the light theme",
  );
  await evaluate(`(() => {
    const theme = document.querySelector('#theme');
    theme.value = 'system';
    theme.dispatchEvent(new Event('change'));
  })()`);
  assert.equal(await evaluate("document.documentElement.dataset.theme"), "dark");
  assert.ok(
    await evaluate("document.querySelectorAll('#output .result-input .cm-line span').length > 0"),
    "recorded input should retain Sage syntax highlighting",
  );
  assert.equal(
    await evaluate("document.querySelector('#output .result-output')"),
    null,
    "pure typeset results should not duplicate the plain representation",
  );
  await evaluate("document.querySelector('#clear-output').click()");
  await evaluate("document.querySelector('#typeset-math').checked = false");
  await runSource(
    "2/3",
    "document.querySelector('#output .result-output')?.textContent === '2/3'",
  );
  assert.equal(
    await evaluate("document.querySelector('#output .katex')"),
    null,
  );
  await evaluate("document.querySelector('#typeset-math').checked = true; document.querySelector('#clear-output').click()");
  await runSource(
    "u, v = var('u v')\n" +
      "plot3d(u^2-v^2, (u,-1,1), (v,-1,1), " +
      "plot_points=(3,3), color='purple', frame=False)",
    "document.querySelector('#output .plot.js-plotly-plot') !== null",
  );
  assert.deepEqual(
    await evaluate("Array.from(document.querySelector('#output .plot')?.data ?? [], trace => trace.type)"),
    ["surface"],
  );
  assert.ok(
    (await renderedPlotPixelStats()).chromatic > 100,
    "surface plots should draw visible WebGL pixels",
  );
  await evaluate("document.querySelector('#clear-output').click()");
  await runSource(
    "icosahedron()",
    "document.querySelector('#output .plot.js-plotly-plot') !== null",
  );
  assert.deepEqual(
    await evaluate("Array.from(document.querySelector('#output .plot')?.data ?? [], trace => trace.type)"),
    ["mesh3d"],
  );
  assert.equal(
    await evaluate("['x','y','z','i','j','k'].every(axis => document.querySelector('#output .plot').data[0][axis].every(value => typeof value === 'number'))"),
    true,
    "Plotly numeric arrays should contain primitive JavaScript numbers",
  );
  assert.equal(
    await evaluate("Boolean(document.querySelector('#output .plot')?._fullLayout?.scene?._scene?.glplot)"),
    true,
    "the browser test should exercise a real WebGL 3D scene",
  );
  assert.ok(
    (await renderedPlotPixelStats()).chromatic > 100,
    "mesh plots should draw visible WebGL pixels",
  );
  const widgetExample = EXAMPLES.find(
    (example) => example.id === "interactive-symbolic-plot",
  );
  assert.ok(widgetExample);
  await evaluate("document.querySelector('#clear-output').click()");
  await runSource(
    widgetExample.source,
    "document.querySelector('#output')?.textContent.includes('power') && " +
      "document.querySelector('#output')?.textContent.includes('2x') && " +
      "document.querySelector('#output .js-plotly-plot') !== null",
    30_000,
  );
  assert.ok(
    await evaluate("Math.min(...document.querySelector('#output .js-plotly-plot').data[0].y) >= 0"),
    "the initial widget plot should display x squared",
  );
  await evaluate("document.querySelector('#output [role=slider]').focus()");
  await command("Input.dispatchKeyEvent", {
    type: "keyDown", key: "ArrowRight", code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await command("Input.dispatchKeyEvent", {
    type: "keyUp", key: "ArrowRight", code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await waitFor(
    "Number(document.querySelector('#output [role=slider]')?.getAttribute('aria-valuenow')) === 3 && " +
      "Math.min(...document.querySelector('#output .js-plotly-plot').data[0].y) < -1",
    30_000,
  );
  await evaluate("document.querySelector('#clear-output').click()");
  await runSource(
    "@interact\ndef repeated_callback(n=(1..100)):\n    print(n, n**3)",
    "document.querySelector('#output [role=slider]') !== null && " +
      "document.querySelector('#output')?.textContent.includes('1 1')",
    30_000,
  );
  await evaluate("document.querySelector('#output [role=slider]').focus()");
  for (const [value, cube] of [[2, 8], [3, 27], [4, 64], [5, 125], [6, 216]]) {
    await pressKey("ArrowRight", "ArrowRight", 39);
    await waitFor(
      `Number(document.querySelector('#output [role=slider]')?.getAttribute('aria-valuenow')) === ${value - 1} && ` +
        `document.querySelector('#output')?.textContent.includes('${value} ${cube}')`,
      30_000,
    );
  }
  await evaluate("document.querySelector('#clear-output').click()");
  await runSource(
    "@interact\ndef plotted_callback(n=(1..10)):\n    show(plot(x^n))",
    "document.querySelector('#output [role=slider]') !== null && " +
      "document.querySelector('#output .js-plotly-plot') !== null",
    30_000,
  );
  const expressionExample = EXAMPLES.find(
    (example) => example.id === "interactive-function-explorer",
  );
  assert.ok(expressionExample);
  await evaluate("document.querySelector('#clear-output').click()");
  await runSource(
    expressionExample.source,
    "document.querySelector('#output input[type=text]')?.value === 'x^3 - 2*x' && " +
      "document.querySelector('#output .js-plotly-plot') !== null",
    30_000,
  );
  assert.ok(
    await evaluate("Math.min(...document.querySelector('#output .js-plotly-plot').data[0].y) < -1"),
    "the initial expression widget should display a cubic with negative values",
  );
  await evaluate(`(() => {
    const input = document.querySelector('#output input[type=text]');
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    setValue.call(input, 'x^4');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(
    "document.querySelector('#output input[type=text]')?.value === 'x^4' && " +
      "Math.min(...document.querySelector('#output .js-plotly-plot').data[0].y) >= 0",
    30_000,
  );
  await evaluate(`(() => {
    const input = document.querySelector('#output input[type=text]');
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    setValue.call(input, 'x^5');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(
    "document.querySelector('#output input[type=text]')?.value === 'x^5' && " +
      "Math.min(...document.querySelector('#output .js-plotly-plot').data[0].y) < -1",
    30_000,
  );
  await evaluate("document.querySelector('#clear-output').click()");
  const blankLineExplorer =
    "from IPython.display import display\n\n" +
    "@interact\n" +
    "def blank_line_explorer(f=input_box('x^3 - 2*x', label='f(x)=')):\n" +
    "    display(f)\n" +
    "    display(f.derivative(x))\n" +
    "    display(plot(f, (x, -2, 2), ymin=-10, ymax=10))";
  await runCellSource(
    blankLineExplorer,
    "document.querySelector('#output input[type=text]')?.value === 'x^3 - 2*x' && " +
      "document.querySelector('#output .js-plotly-plot') !== null && " +
      "!document.querySelector('#output')?.textContent.includes('display is not defined')",
    30_000,
  );
  const galleryExample = EXAMPLES.find(
    (example) => example.id === "ipywidgets-core-gallery",
  );
  assert.ok(galleryExample);
  await evaluate("document.querySelector('#clear-output').click()");
  await runSource(
    galleryExample.source,
    "document.querySelector('#output [role=slider]') !== null && " +
      "document.querySelector('#output input[type=number]')?.value === '4' && " +
      "Array.from(document.querySelectorAll('#output button'))" +
      ".some((button) => button.textContent.includes('Upload text'))",
    30_000,
  );
  await evaluate("document.querySelector('#output [role=slider]').focus()");
  await command("Input.dispatchKeyEvent", {
    type: "keyDown", key: "ArrowRight", code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await command("Input.dispatchKeyEvent", {
    type: "keyUp", key: "ArrowRight", code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await waitFor(
    "Number(document.querySelector('#output [role=slider]')?.getAttribute('aria-valuenow')) === 5 && " +
      "document.querySelector('#output input[type=number]')?.value === '5'",
    30_000,
  );
  await evaluate(`Array.from(document.querySelectorAll('#output button'))
    .find((button) => button.textContent.includes('Capture output')).click()`);
  await waitFor(
    "document.querySelector('#output')?.textContent.includes('captured 5') && " +
      "document.querySelector('#output .katex') !== null",
    30_000,
  );
  await evaluate(`Array.from(document.querySelectorAll('#output button'))
    .find((button) => button.textContent.includes('Clear output')).click()`);
  await waitFor(
    "!document.querySelector('#output')?.textContent.includes('captured 5')",
    30_000,
  );
  await evaluate(`Array.from(document.querySelectorAll('#output button'))
    .find((button) => button.textContent.includes('Raise error')).click()`);
  await waitFor(
    "document.querySelector('#output .widget-error')?.textContent.includes('deliberate widget error')",
    30_000,
  );
  await command("Page.setInterceptFileChooserDialog", { enabled: true });
  const fileChooser = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("timed out waiting for the widget file chooser")),
      10_000,
    );
    const listener = ({ data }) => {
      const message = JSON.parse(data);
      if (message.method !== "Page.fileChooserOpened") return;
      clearTimeout(timeout);
      socket.removeEventListener("message", listener);
      resolve(message.params);
    };
    socket.addEventListener("message", listener);
  });
  await evaluate(`Array.from(document.querySelectorAll('#output button'))
    .find((button) => button.textContent.includes('Upload text')).click()`);
  const fileChooserEvent = await fileChooser;
  await command("DOM.setFileInputFiles", {
    backendNodeId: fileChooserEvent.backendNodeId,
    files: [uploadPath],
  });
  await command("Page.setInterceptFileChooserDialog", { enabled: false });
  await waitFor(
    `document.querySelector('#output')?.textContent.includes(${JSON.stringify(
      `uploaded ${uploadName} ${uploadBytes.length} ${uploadBytes.reduce((sum, value) => sum + value, 0)}`,
    )})`,
    30_000,
  );
  await evaluate("document.querySelector('#clear-output').click()");
  await runSource(
    "import ipywidgets as widgets\nwidgets.IntSlider(min=0, max=100)",
    "document.querySelector('#output [role=slider]') !== null && " +
      "!document.querySelector('#output')?.textContent.includes('IntSlider(value=')",
    30_000,
  );
  await evaluate("document.querySelector('#reset').click()");
  await waitFor(
    "document.querySelector('#output .widget-stale-notice')?.textContent.includes('Run its input again') && " +
      "document.querySelector('#output input[type=text]') === null && " +
      "document.querySelector('#kernel-status')?.dataset.state === 'ready'",
    30_000,
  );
  await evaluate("document.querySelector('#clear-output').click()");
  await runFactor();
  await evaluate("navigator.serviceWorker.ready.then(() => true)");
  await command("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await command("Page.reload", { ignoreCache: true });
  await waitFor(`document.querySelector('#kernel-status')?.dataset.state === 'ready'`);
  assert.equal(await evaluate("document.querySelector('#source').value"), "factor(2026)");
  await runFactor({ setSource: false });
  assert.deepEqual(errors, []);
  socket.close();
} finally {
  chrome.kill("SIGTERM");
  server.close();
  rmSync(uploadDirectory, { recursive: true, force: true });
}
