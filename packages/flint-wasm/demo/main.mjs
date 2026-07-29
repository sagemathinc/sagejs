const input = document.querySelector("#source");
const runButton = document.querySelector("#run");
const interruptButton = document.querySelector("#interrupt");
const output = document.querySelector("#output");

let requestId = 0;
let worker;
let outputBuffer = "";

function startWorker() {
  worker = new Worker(new URL("./worker.mjs", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    if (data.id !== requestId) {
      return;
    }
    if (data.type === "output") {
      outputBuffer += data.text;
      output.textContent = outputBuffer;
      return;
    }
    if (data.ok) {
      outputBuffer += data.result;
    } else {
      if (outputBuffer && !outputBuffer.endsWith("\n")) {
        outputBuffer += "\n";
      }
      outputBuffer += `Error: ${data.error}`;
    }
    output.textContent = outputBuffer;
    runButton.disabled = false;
    interruptButton.disabled = true;
  };
}

function interrupt() {
  worker?.terminate();
  requestId += 1;
  startWorker();
  outputBuffer = "";
  output.textContent = "Interrupted.";
  runButton.disabled = false;
  interruptButton.disabled = true;
}

runButton.addEventListener("click", () => {
  requestId += 1;
  outputBuffer = "";
  output.textContent = "Running…";
  runButton.disabled = true;
  interruptButton.disabled = false;
  worker.postMessage({
    type: "evaluate",
    id: requestId,
    source: input.value,
  });
});
interruptButton.addEventListener("click", interrupt);

startWorker();

const automaticInput = new URLSearchParams(location.search).get("run");
if (automaticInput !== null) {
  input.value = automaticInput;
  runButton.click();
}
