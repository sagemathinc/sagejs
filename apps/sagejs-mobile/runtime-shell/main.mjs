import { createSage, SageSessionInterruptedError } from './sagejs/kernel.mjs';
import {
  clearSageDisplay,
  renderSageDisplay,
} from './sagejs/plotly-renderer.mjs';

const PROTOCOL = 1;
const capability = globalThis.__SAGEJS_MOBILE_BRIDGE_CAPABILITY__;
delete globalThis.__SAGEJS_MOBILE_BRIDGE_CAPABILITY__;
if (typeof capability !== 'string' || capability.length < 32) {
  throw new Error('missing native bridge capability');
}
const source = document.querySelector('#source');
const runButton = document.querySelector('#run');
const interruptButton = document.querySelector('#interrupt');
const shareSourceButton = document.querySelector('#share-source');
const sharePlotButton = document.querySelector('#share-plot');
const status = document.querySelector('#status');
const output = document.querySelector('#output');
const display = document.querySelector('#display');
const assetVersion = document.querySelector(
  'meta[name="sagejs-artifact"]',
).content;

let sequence = 0;
let session;
let settings = {
  appearance: 'system',
  evaluationTimeoutMs: 30000,
  memoryTargetMiB: 384,
  autoInterruptOnBackground: true,
};
let worksheet = { id: 'unbound', title: 'Worksheet', source: '', revision: 0 };
let lastDisplay;
let changeTimer;

function post(type, payload) {
  window.ReactNativeWebView?.postMessage(
    JSON.stringify({
      protocol: PROTOCOL,
      capability,
      id: `web-${++sequence}`,
      type,
      payload,
    }),
  );
}

function share(kind, suggestedName, content) {
  post('share.request', { kind, suggestedName, content });
}

function reportError(error, code = 'runtime-failure', recoverable = true) {
  const message = error instanceof Error ? error.message : String(error);
  status.textContent = message;
  post('runtime.error', { code, message, recoverable });
}

async function start() {
  const started = performance.now();
  session = await createSage({
    async onGraphicsSave(request) {
      share(
        'plot-json',
        request.filename || 'SageJS-plot.json',
        JSON.stringify(request.display),
      );
    },
  });
  session.on('stdout', text => {
    output.textContent += text;
  });
  runButton.disabled = false;
  status.textContent = 'Ready.';
  post('runtime.ready', {
    engineVersion: 'bundled',
    assetVersion,
    assetOrigin: 'loopback-http',
    assetScheme: location.protocol.slice(0, -1),
    assetHost: location.hostname,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    sharedArrayBuffer: typeof globalThis.SharedArrayBuffer === 'function',
    workerTopology: {
      outer: 'dedicated-module-worker',
      compiler: 'nested-module-worker',
    },
    capabilities: ['offline', 'interrupt', 'graphics', 'persistent-session'],
  });
  post('runtime.telemetry', {
    event: 'startup',
    durationMs: performance.now() - started,
  });
}

async function run() {
  if (!session) return;
  const started = performance.now();
  runButton.disabled = true;
  interruptButton.disabled = false;
  output.textContent = '';
  status.textContent = 'Running…';
  lastDisplay = undefined;
  sharePlotButton.hidden = true;
  clearSageDisplay(display);
  try {
    const result = await session.evaluate(source.value, {
      filename: `${worksheet.title || 'Worksheet'}.sage`,
      timeout: settings.evaluationTimeoutMs,
    });
    if (result.repr) output.textContent += result.repr;
    if (result.display) {
      lastDisplay = result.display;
      await renderSageDisplay(display, result.display, globalThis.Plotly);
      sharePlotButton.hidden = false;
    }
    const durationMs = performance.now() - started;
    status.textContent = `Finished in ${(durationMs / 1000).toFixed(2)} s.`;
    post('runtime.telemetry', {
      event: result.display ? 'plot' : 'evaluation',
      durationMs,
    });
  } catch (error) {
    if (error instanceof SageSessionInterruptedError)
      status.textContent = 'Interrupted.';
    else reportError(error, 'evaluation-failure');
  } finally {
    runButton.disabled = false;
    interruptButton.disabled = true;
  }
}

async function interrupt() {
  if (!session) return;
  const started = performance.now();
  await session.interrupt();
  status.textContent = 'Interrupted; kernel restarted.';
  runButton.disabled = false;
  interruptButton.disabled = true;
  post('runtime.telemetry', {
    event: 'interrupt',
    durationMs: performance.now() - started,
  });
}

function loadWorksheet(next) {
  if (!next || typeof next.id !== 'string' || typeof next.source !== 'string')
    return;
  worksheet = next;
  source.value = next.source;
  output.textContent = '';
  clearSageDisplay(display);
  status.textContent = session ? 'Ready.' : 'Loading bundled Sage.js…';
}

function applySettings(next) {
  if (!next || typeof next !== 'object') return;
  settings = next;
  document.documentElement.dataset.appearance = settings.appearance;
}

function notifyWorksheetChanged() {
  clearTimeout(changeTimer);
  if (source.value === worksheet.source) return;
  worksheet = {
    ...worksheet,
    source: source.value,
    revision: worksheet.revision + 1,
  };
  post('worksheet.changed', {
    id: worksheet.id,
    source: worksheet.source,
    revision: worksheet.revision,
  });
}

function receive(event) {
  let message;
  try {
    message = JSON.parse(String(event.data));
  } catch {
    return;
  }
  if (
    message?.protocol !== PROTOCOL ||
    message.capability !== capability ||
    typeof message.type !== 'string'
  )
    return;
  if (message.type === 'host.bootstrap') {
    loadWorksheet(message.payload?.worksheet);
    applySettings(message.payload?.settings);
  } else if (message.type === 'worksheet.load') {
    loadWorksheet(message.payload);
  } else if (message.type === 'runtime.interrupt') {
    void interrupt();
  } else if (message.type === 'runtime.reset') {
    void session?.reset();
  } else if (message.type === 'settings.apply') {
    applySettings(message.payload);
  } else if (
    message.type === 'lifecycle.changed' &&
    message.payload?.state === 'background' &&
    message.payload?.shouldInterrupt
  ) {
    notifyWorksheetChanged();
    void interrupt();
  }
}

source.addEventListener('input', () => {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(notifyWorksheetChanged, 250);
});
source.addEventListener('blur', notifyWorksheetChanged);
source.addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    if (!runButton.disabled) void run();
  }
});
runButton.addEventListener('click', run);
interruptButton.addEventListener('click', interrupt);
shareSourceButton.addEventListener('click', () =>
  share('sage-source', worksheet.title, source.value),
);
sharePlotButton.addEventListener('click', () => {
  if (lastDisplay)
    share('plot-json', `${worksheet.title}-plot`, JSON.stringify(lastDisplay));
});
window.addEventListener('message', receive);
document.addEventListener('message', receive);
void start().catch(error => reportError(error, 'startup-failure', false));
