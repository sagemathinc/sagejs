const input = document.querySelector("#source");
const runButton = document.querySelector("#run");
const interruptButton = document.querySelector("#interrupt");
const output = document.querySelector("#output");

let requestId = 0;
let worker;

function startWorker() {
  worker = new Worker(new URL("./worker.mjs", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    if (data.id !== requestId) {
      return;
    }
    output.textContent = data.ok ? data.result : `Error: ${data.error}`;
    runButton.disabled = false;
    interruptButton.disabled = true;
  };
}

function interrupt() {
  worker?.terminate();
  requestId += 1;
  startWorker();
  output.textContent = "Interrupted.";
  runButton.disabled = false;
  interruptButton.disabled = true;
}

runButton.addEventListener("click", () => {
  requestId += 1;
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
