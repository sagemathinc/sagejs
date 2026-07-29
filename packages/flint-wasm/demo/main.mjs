import {
  createSage,
  SageSessionInterruptedError,
} from "../kernel.mjs";
import {
  clearSageDisplay,
  renderSageDisplay,
} from "../plotly-renderer.mjs";

const input = document.querySelector("#source");
const runButton = document.querySelector("#run");
const interruptButton = document.querySelector("#interrupt");
const output = document.querySelector("#output");
const display = document.querySelector("#display");

let session;
let runId = 0;
let outputBuffer = "";

async function startSession() {
  const value = await createSage();
  value.on("stdout", (text) => {
    outputBuffer += text;
    output.textContent = outputBuffer;
  });
  return value;
}

async function interrupt() {
  runId += 1;
  outputBuffer = "";
  output.textContent = "Interrupted.";
  clearSageDisplay(display);
  runButton.disabled = false;
  interruptButton.disabled = true;
  await session?.interrupt();
}

runButton.addEventListener("click", async () => {
  const currentRun = ++runId;
  outputBuffer = "";
  output.textContent = "Running…";
  clearSageDisplay(display);
  runButton.disabled = true;
  interruptButton.disabled = false;
  try {
    session ??= await startSession();
    if (currentRun !== runId) return;
    const result = await session.evaluate(input.value);
    if (currentRun !== runId) return;
    outputBuffer += result.repr;
    output.textContent = outputBuffer;
    if (result.display) {
      await renderSageDisplay(display, result.display);
    }
  } catch (error) {
    if (currentRun !== runId || error instanceof SageSessionInterruptedError) {
      return;
    }
    if (outputBuffer && !outputBuffer.endsWith("\n")) {
      outputBuffer += "\n";
    }
    outputBuffer += `Error: ${
      error instanceof Error ? error.message : String(error)
    }`;
    output.textContent = outputBuffer;
  } finally {
    if (currentRun === runId) {
      runButton.disabled = false;
      interruptButton.disabled = true;
    }
  }
});

input.addEventListener("keydown", (event) => {
  if (
    event.key === "Enter" &&
    (event.shiftKey || event.ctrlKey) &&
    !runButton.disabled
  ) {
    event.preventDefault();
    runButton.click();
  }
});

interruptButton.addEventListener("click", interrupt);

const automaticInput = new URLSearchParams(location.search).get("run");
if (automaticInput !== null) {
  input.value = automaticInput;
  runButton.click();
}
