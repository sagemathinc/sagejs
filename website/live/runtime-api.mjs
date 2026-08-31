let runtimePromise;
let widgetRuntimePromise;
const resourceRoot = new URL("./", import.meta.url);

export function requestCredentials() {
  // Managed CoCalc apps authenticate same-origin asset requests with their
  // session cookie. This is harmless on the public, cookie-free deployment
  // and never sends credentials to the immutable cross-origin runtime host.
  return "same-origin";
}

function loadScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error(`could not load ${source}`)), { once: true });
    document.head.append(script);
  });
}

function loadStylesheet(source) {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = source;
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error(`could not load ${source}`)), { once: true });
    document.head.append(link);
  });
}

/** Load the immutable, content-addressed browser runtime selected by version.json. */
export function loadSageRuntime() {
  runtimePromise ??= (async () => {
    const versionUrl = new URL("runtime-version.json", resourceRoot);
    const response = await fetch(versionUrl, {
      cache: "no-store",
      credentials: requestCredentials(),
    });
    if (!response.ok) throw new Error(`runtime version returned HTTP ${response.status}`);
    const version = await response.json();
    if (
      version.schema !== "org.sagejs.web/runtime-v1" ||
      typeof version.assetBase !== "string" ||
      !/^\.\/assets\/sha256-[a-f0-9]{64}\/$/.test(version.assetBase)
    ) {
      throw new Error("runtime version metadata is invalid");
    }
    const assetBase = new URL(version.assetBase, versionUrl);
    await Promise.all([
      loadScript(new URL("dist/plotly.min.js", assetBase)),
      loadScript(new URL("vendor/katex/katex.min.js", resourceRoot)),
      loadStylesheet(new URL("vendor/katex/katex.min.css", resourceRoot)),
    ]);
    const [kernel, renderer] = await Promise.all([
      import(new URL("kernel.mjs", assetBase)),
      import(new URL("plotly-renderer.mjs", assetBase)),
    ]);
    return Object.freeze({ ...kernel, ...renderer, version });
  })();
  return runtimePromise;
}

/** Load the standard widget manager and controls only when first needed. */
export function loadWidgetRuntime() {
  widgetRuntimePromise ??= Promise.all([
    loadStylesheet(new URL("vendor/widgets/widgets.built.css", resourceRoot)),
    import(new URL("vendor/widgets/index.mjs", resourceRoot)),
  ]).then(([, manager]) => manager);
  return widgetRuntimePromise;
}
