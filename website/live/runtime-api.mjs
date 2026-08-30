let runtimePromise;

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
    const response = await fetch("./runtime-version.json", {
      cache: "no-store",
      credentials: requestCredentials(location.search),
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
    await Promise.all([
      loadScript(`${version.assetBase}dist/plotly.min.js`),
      loadScript("./vendor/katex/katex.min.js"),
      loadStylesheet("./vendor/katex/katex.min.css"),
    ]);
    const [kernel, renderer] = await Promise.all([
      import(`${version.assetBase}kernel.mjs`),
      import(`${version.assetBase}plotly-renderer.mjs`),
    ]);
    return Object.freeze({ ...kernel, ...renderer, version });
  })();
  return runtimePromise;
}
