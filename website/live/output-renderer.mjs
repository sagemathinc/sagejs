import { assertDisplayWithinLimit } from "./resource-policy.mjs";

/** Create the rich-output pipeline shared by the app and embedded cells. */
export function createOutputRenderer({
  getWidgetHost = () => undefined,
  getRenderSageDisplay,
  typesetMath = () => true,
  displayWithinLimit = assertDisplayWithinLimit,
} = {}) {
  if (typeof getRenderSageDisplay !== "function") {
    throw new TypeError("a Sage display renderer getter is required");
  }

  async function renderMimeBundle(destination, data, metadata = {}) {
    if (!data || typeof data !== "object") return;
    const widgetHost = getWidgetHost();
    if (widgetHost?.isWidgetDisplay(data)) {
      destination.classList.add("widget-output");
      await widgetHost.render(data, destination);
      return;
    }
    for (const mime of ["application/vnd.plotly.v1+json", "text/latex"]) {
      if (!(mime in data)) continue;
      if (mime === "text/latex" && !typesetMath()) break;
      displayWithinLimit({ mime, data: data[mime] });
      await getRenderSageDisplay()(destination, {
        mime,
        data: data[mime],
        metadata,
      });
      return;
    }
    const document = destination.ownerDocument;
    for (const mime of ["image/png", "image/jpeg", "image/webp"]) {
      if (!(mime in data)) continue;
      const image = document.createElement("img");
      image.alt = String(metadata?.[mime]?.alt ?? "Generated output");
      image.src = "data:" + mime + ";base64," + String(data[mime]);
      destination.append(image);
      return;
    }
    const text = "text/plain" in data
      ? data["text/plain"]
      : "text/latex" in data
        ? data["text/latex"]
        : "text/html" in data
          ? data["text/html"]
          : JSON.stringify(data);
    const pre = document.createElement("pre");
    pre.className = "result-output";
    pre.textContent = String(text ?? "");
    destination.append(pre);
  }

  async function renderWidgetOutput(outputItem, destination) {
    if (!outputItem || typeof outputItem !== "object") return;
    const outputType = outputItem.output_type;
    if (outputType === "stream") {
      const pre = destination.ownerDocument.createElement("pre");
      pre.className = "result-output";
      pre.textContent = String(outputItem.text ?? "");
      destination.append(pre);
      return;
    }
    if (outputType === "error") {
      const pre = destination.ownerDocument.createElement("pre");
      pre.className = "result-output widget-error";
      pre.textContent = Array.isArray(outputItem.traceback)
        ? outputItem.traceback.join("\n")
        : (outputItem.ename ?? "Error") + ": " + (outputItem.evalue ?? "");
      destination.append(pre);
      return;
    }
    if (outputType === "display_data" || outputType === "execute_result") {
      await renderMimeBundle(destination, outputItem.data, outputItem.metadata);
    }
  }

  function createEventRenderer(article, pre) {
    const displays = new Map();
    const pending = [];
    let clearOnNext = false;
    let count = 0;
    const clear = () => {
      for (const element of article.querySelectorAll(".event-output")) {
        element.remove();
      }
      displays.clear();
    };
    return {
      get count() { return count; },
      event(event) {
        if (event?.schema !== "sagejs.output-event/v1") return;
        if (getWidgetHost()?.captureOutput(event)) return;
        if (event.type === "stream") return;
        if (event.type === "clear_output") {
          if (event.wait) clearOnNext = true;
          else clear();
          return;
        }
        if (clearOnNext) {
          clear();
          clearOnNext = false;
        }
        if (event.type === "error") {
          const text = Array.isArray(event.traceback)
            ? event.traceback.join("\n")
            : (event.name ?? "Error") + ": " + (event.message ?? "");
          pre.textContent =
            (pre.textContent === "Starting…" ? "" : pre.textContent) + text;
          count += 1;
          return;
        }
        if (
          event.type !== "display_data" &&
          event.type !== "update_display_data"
        ) {
          return;
        }
        let destination = event.displayId
          ? displays.get(event.displayId)
          : undefined;
        if (!destination) {
          destination = article.ownerDocument.createElement("div");
          destination.className = "event-output";
          article.append(destination);
          if (event.displayId) displays.set(event.displayId, destination);
        } else {
          destination.replaceChildren();
        }
        count += 1;
        pending.push(renderMimeBundle(destination, event.data, event.metadata));
      },
      async settled() {
        await Promise.all(pending);
      },
    };
  }

  return Object.freeze({
    createEventRenderer,
    renderMimeBundle,
    renderWidgetOutput,
  });
}
