const SCHEMA = "org.sagejs.cell-frame/v1";
const iframe = document.querySelector("#sagejs-frame");
const status = document.querySelector("#frame-status");
const frameUrl = new URL("./frame.html", import.meta.url);
frameUrl.searchParams.set("parentOrigin", location.origin);
iframe.src = frameUrl;

let nextId = 0;
const pending = new Map();

function request(action, fields = {}) {
  const id = `example-${++nextId}`;
  iframe.contentWindow.postMessage({
    schema: SCHEMA,
    type: "request",
    id,
    action,
    ...fields,
  }, frameUrl.origin);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

addEventListener("message", ({ source, origin, data }) => {
  if (source !== iframe.contentWindow || origin !== frameUrl.origin || data?.schema !== SCHEMA) return;
  if (data.type === "ready") {
    status.textContent = "Frame ready; initializing its local kernel…";
    void request("initialize", {
      configuration: { editor: false, runButtonText: "Update" },
      source: `from IPython.display import display

@interact
def derivative(n=slider(1, 6, 1, default=2, label='power')):
    display((x^n).derivative(x))`,
    }).then(() => request("run")).then(() => {
      status.textContent = "Interactive calculation ready.";
    }, (error) => {
      status.textContent = `Frame failed: ${error.message}`;
    });
    return;
  }
  if (data.type !== "response") return;
  const handlers = pending.get(data.id);
  if (!handlers) return;
  pending.delete(data.id);
  if (data.ok) handlers.resolve(data.result);
  else handlers.reject(Object.assign(new Error(data.error?.message), { name: data.error?.name }));
});
