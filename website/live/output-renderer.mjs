import { assertDisplayWithinLimit } from "./resource-policy.mjs";

const WIDGET_VIEW_MIME = "application/vnd.jupyter.widget-view+json";
const BLOCKED_HTML_ELEMENTS = new Set([
  "BASE", "BUTTON", "EMBED", "FORM", "IFRAME", "INPUT", "LINK", "META",
  "OBJECT", "OPTION", "SCRIPT", "SELECT", "STYLE", "SVG", "TEXTAREA",
]);

function safeHtmlUrl(value, attribute) {
  const source = String(value ?? "").trim();
  if (!source || source.startsWith("#")) return true;
  if (attribute === "src" && /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(source)) {
    return true;
  }
  try {
    const protocol = new URL(source, "https://sagejs.invalid/").protocol;
    return ["http:", "https:", "mailto:"].includes(protocol);
  } catch {
    return false;
  }
}

function renderEmbeddedMath(root) {
  const katex = globalThis.katex;
  const document = root.ownerDocument;
  if (!katex?.render || !document?.createTreeWalker) return;
  const showText = document.defaultView?.NodeFilter?.SHOW_TEXT ?? 4;
  const walker = document.createTreeWalker(root, showText);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const pattern = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g;
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest("pre, code, .katex")) continue;
    const source = node.nodeValue ?? "";
    pattern.lastIndex = 0;
    if (!pattern.test(source)) continue;
    pattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let offset = 0;
    for (const match of source.matchAll(pattern)) {
      fragment.append(document.createTextNode(source.slice(offset, match.index)));
      const destination = document.createElement("span");
      const displayMode = match[1] !== undefined || match[3] !== undefined;
      const formula = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
      try {
        katex.render(formula, destination, {
          displayMode,
          throwOnError: false,
          strict: "ignore",
          trust: false,
        });
      } catch {
        destination.textContent = match[0];
      }
      fragment.append(destination);
      offset = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(source.slice(offset)));
    node.replaceWith(fragment);
  }
}

function renderSanitizedHtml(destination, source) {
  const document = destination.ownerDocument;
  const template = document.createElement("template");
  template.innerHTML = String(source ?? "");
  for (const element of [...template.content.querySelectorAll("*")]) {
    if (BLOCKED_HTML_ELEMENTS.has(element.tagName)) {
      element.replaceWith(document.createTextNode(element.textContent ?? ""));
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith("on") ||
        name === "style" ||
        name === "srcdoc" ||
        ((name === "href" || name === "src") && !safeHtmlUrl(attribute.value, name))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.tagName === "A") {
      element.setAttribute("rel", "noopener noreferrer");
      element.setAttribute("target", "_blank");
    }
  }
  const wrapper = document.createElement("div");
  wrapper.className = "html-output";
  wrapper.append(template.content);
  destination.append(wrapper);
  renderEmbeddedMath(wrapper);
}

/** Normalize a final evaluation result into the same bundle used by display(). */
export function evaluationResultBundle(result, { typesetMath = true } = {}) {
  const data = { ...(result?.mimeBundle?.data ?? {}) };
  const metadata = { ...(result?.mimeBundle?.metadata ?? {}) };
  if (result?.display) data[result.display.mime] = result.display.data;
  const rich = Object.keys(data).some((mime) =>
    mime === WIDGET_VIEW_MIME ||
    mime === "application/vnd.plotly.v1+json" ||
    mime === "image/png" ||
    mime === "image/jpeg" ||
    mime === "image/webp" ||
    (mime === "text/latex" && typesetMath));
  return Object.freeze({ data, metadata, rich });
}

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
    if ("text/html" in data) {
      displayWithinLimit({ mime: "text/html", data: data["text/html"] });
      renderSanitizedHtml(destination, data["text/html"]);
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
