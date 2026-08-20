package org.sagemath.sagejs

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LoopbackHttpPolicyTest {
  @Test
  fun acceptsOnlyCanonicalCapabilityAssets() {
    assertEquals(
      "sagejs/dist/flint-factor.wasm",
      LoopbackHttpPolicy.decodeAssetPath(
        "/secret/sagejs/dist/flint-factor.wasm",
        "secret",
      ),
    )
    for (target in listOf(
      "/wrong/index.html",
      "/secret/../index.html",
      "/secret/%2e%2e/index.html",
      "/secret/a%2fb/../index.html",
      "/secret//index.html",
      "/secret/index.html?remote=true",
      "/secret/index.html#fragment",
      "/secret/index.html%00.js",
    )) assertNull(target, LoopbackHttpPolicy.decodeAssetPath(target, "secret"))
  }

  @Test
  fun returnsExplicitExecutableMimeTypes() {
    assertEquals("application/wasm", LoopbackHttpPolicy.mime("kernel.wasm"))
    assertEquals(
      "text/javascript; charset=utf-8",
      LoopbackHttpPolicy.mime("worker.mjs"),
    )
    assertEquals(
      "application/json; charset=utf-8",
      LoopbackHttpPolicy.mime("receipt.json"),
    )
  }
}

