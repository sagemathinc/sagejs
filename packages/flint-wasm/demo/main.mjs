import {
  createSage,
  SageSessionInterruptedError,
} from "../kernel.mjs";

const input = document.querySelector("#source");
const runButton = document.querySelector("#run");
const interruptButton = document.querySelector("#interrupt");
const output = document.querySelector("#output");

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
  runButton.disabled = false;
  interruptButton.disabled = true;
  await session?.interrupt();
}

runButton.addEventListener("click", async () => {
  const currentRun = ++runId;
  outputBuffer = "";
  output.textContent = "Running…";
  runButton.disabled = true;
  interruptButton.disabled = false;
  try {
    session ??= await startSession();
    if (currentRun !== runId) return;
    const result = await session.evaluate(input.value);
    if (currentRun !== runId) return;
    outputBuffer += result.repr;
    output.textContent = outputBuffer;
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
interruptButton.addEventListener("click", interrupt);

const automaticInput = new URLSearchParams(location.search).get("run");
if (automaticInput !== null) {
  input.value = automaticInput;
  runButton.click();
}
