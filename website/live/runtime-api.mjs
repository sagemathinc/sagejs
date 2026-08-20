let runtimePromise;

function loadScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error(`could not load ${source}`)), { once: true });
    document.head.append(script);
  });
}

/** Load the immutable, content-addressed browser runtime selected by version.json. */
export function loadSageRuntime() {
  runtimePromise ??= (async () => {
    const response = await fetch("./runtime-version.json", { cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new Error(`runtime version returned HTTP ${response.status}`);
    const version = await response.json();
    if (
      version.schema !== "org.sagejs.web/runtime-v1" ||
      typeof version.assetBase !== "string" ||
      !/^\.\/assets\/sha256-[a-f0-9]{64}\/$/.test(version.assetBase)
    ) {
      throw new Error("runtime version metadata is invalid");
    }
    await loadScript(`${version.assetBase}dist/plotly.min.js`);
    const [kernel, renderer] = await Promise.all([
      import(`${version.assetBase}kernel.mjs`),
      import(`${version.assetBase}plotly-renderer.mjs`),
    ]);
    return Object.freeze({ ...kernel, ...renderer, version });
  })();
  return runtimePromise;
}
