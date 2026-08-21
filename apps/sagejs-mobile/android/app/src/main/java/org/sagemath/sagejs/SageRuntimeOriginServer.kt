package org.sagemath.sagejs

import android.content.res.AssetManager
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.json.JSONObject

data class RuntimeOriginDescription(
  val url: String,
  val root: String,
  val origin: String,
  val productionIdentity: String,
)

internal data class VerifiedRuntimeAssets(
  val productionIdentity: String,
  val paths: Set<String>,
)

internal object LoopbackHttpPolicy {
  const val CSP = "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; " +
    "worker-src 'self' blob:; connect-src 'self'; img-src 'self' data: blob:; " +
    "style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; " +
    "base-uri 'none'; frame-ancestors 'none'"

  fun decodeAssetPath(target: String, capability: String): String? {
    if (target.contains('?') || target.contains('#') || target.contains('\u0000')) return null
    val prefix = "/$capability/"
    val raw = try {
      java.net.URI(target).rawPath
    } catch (_: Exception) {
      return null
    }
    if (!raw.startsWith(prefix)) return null
    val decoded = try {
      URLDecoder.decode(raw.substring(prefix.length).replace("+", "%2B"), StandardCharsets.UTF_8)
    } catch (_: Exception) {
      return null
    }
    if (
      decoded.isEmpty() || decoded.startsWith('/') || decoded.contains('\\') ||
      decoded.contains('\u0000') || decoded.split('/').any { it.isEmpty() || it == "." || it == ".." }
    ) return null
    return decoded
  }

  fun mime(path: String): String = when {
    path.endsWith(".html") -> "text/html; charset=utf-8"
    path.endsWith(".mjs") || path.endsWith(".js") -> "text/javascript; charset=utf-8"
    path.endsWith(".wasm") -> "application/wasm"
    path.endsWith(".json") -> "application/json; charset=utf-8"
    path.endsWith(".css") -> "text/css; charset=utf-8"
    path.endsWith(".svg") -> "image/svg+xml"
    path.endsWith(".png") -> "image/png"
    else -> "application/octet-stream"
  }
}
object SageRuntimeOriginServer {
  private const val ASSET_ROOT = "runtime"
  private val lock = Any()
  private var server: ServerSocket? = null
  private var executor: ExecutorService? = null
  private var description: RuntimeOriginDescription? = null

  fun start(assets: AssetManager): RuntimeOriginDescription = synchronized(lock) {
    description?.let { return it }
    val verified = verifyAssets(assets)
    val capabilityBytes = ByteArray(32).also(SecureRandom()::nextBytes)
    val capability = capabilityBytes.joinToString("") { "%02x".format(it) }
    val socket = ServerSocket(0, 32, InetAddress.getByName("127.0.0.1"))
    check(socket.inetAddress.hostAddress == "127.0.0.1") { "runtime server escaped loopback" }
    val pool = Executors.newCachedThreadPool { task ->
      Thread(task, "sagejs-runtime-origin").apply { isDaemon = true }
    }
    val origin = "http://127.0.0.1:${socket.localPort}"
    val root = "$origin/$capability/"
    val result = RuntimeOriginDescription(
      url = "${root}index.html",
      root = root,
      origin = origin,
      productionIdentity = verified.productionIdentity,
    )
    server = socket
    executor = pool
    description = result
    pool.execute {
      while (!socket.isClosed) {
        try {
          val client = socket.accept()
          pool.execute { serve(client, assets, verified.paths, capability) }
        } catch (_: Exception) {
          if (!socket.isClosed) stop()
        }
      }
    }
    result
  }

  fun stop() = synchronized(lock) {
    description = null
    server?.close()
    server = null
    executor?.shutdownNow()
    executor = null
  }

  private fun serve(client: Socket, assets: AssetManager, allowlist: Set<String>, capability: String) {
    client.use { socket ->
      socket.soTimeout = 5_000
      val input = BufferedInputStream(socket.getInputStream())
      val output = BufferedOutputStream(socket.getOutputStream())
      val requestLine = readAsciiLine(input, 8_192) ?: return
      val parts = requestLine.split(' ')
      var headerCount = 0
      while (true) {
        val line = readAsciiLine(input, 8_192) ?: return
        if (line.isEmpty()) break
        if (++headerCount > 100) return
      }
      if (parts.size != 3 || parts[2] != "HTTP/1.1") {
        respond(output, 400, "Bad Request", null, null, false)
        return
      }
      val head = parts[0] == "HEAD"
      if (!head && parts[0] != "GET") {
        respond(output, 405, "Method Not Allowed", null, null, false)
        return
      }
      val path = LoopbackHttpPolicy.decodeAssetPath(parts[1], capability)
      if (path == null || !allowlist.contains(path)) {
        respond(output, 404, "Not Found", null, null, false)
        return
      }
      val bytes = assets.open("$ASSET_ROOT/$path", AssetManager.ACCESS_STREAMING).use { it.readBytes() }
      respond(output, 200, "OK", path, bytes, head)
    }
  }

  private fun respond(
    output: BufferedOutputStream,
    status: Int,
    reason: String,
    path: String?,
    bytes: ByteArray?,
    head: Boolean,
  ) {
    val body = bytes ?: ByteArray(0)
    val cache = if (path == "index.html") "no-store" else "public, max-age=31536000, immutable"
    val headers = buildString {
      append("HTTP/1.1 $status $reason\r\n")
      append("Content-Length: ${body.size}\r\n")
      append("Content-Type: ${path?.let(LoopbackHttpPolicy::mime) ?: "text/plain; charset=utf-8"}\r\n")
      append("Cache-Control: $cache\r\n")
      append("Cross-Origin-Opener-Policy: same-origin\r\n")
      append("Cross-Origin-Embedder-Policy: require-corp\r\n")
      append("Cross-Origin-Resource-Policy: same-origin\r\n")
      append("Content-Security-Policy: ${LoopbackHttpPolicy.CSP}\r\n")
      append("X-Content-Type-Options: nosniff\r\n")
      append("Referrer-Policy: no-referrer\r\n")
      append("Permissions-Policy: camera=(), microphone=(), geolocation=()\r\n")
      append("Connection: close\r\n\r\n")
    }
    output.write(headers.toByteArray(StandardCharsets.US_ASCII))
    if (!head) output.write(body)
    output.flush()
  }

  private fun readAsciiLine(input: BufferedInputStream, limit: Int): String? {
    val bytes = ArrayList<Byte>()
    while (bytes.size <= limit) {
      val value = input.read()
      if (value < 0) return null
      if (value == '\n'.code) {
        if (bytes.lastOrNull() == '\r'.code.toByte()) bytes.removeAt(bytes.lastIndex)
        return bytes.toByteArray().toString(StandardCharsets.US_ASCII)
      }
      bytes.add(value.toByte())
    }
    return null
  }

  private fun verifyAssets(assets: AssetManager): VerifiedRuntimeAssets {
    val manifest = JSONObject(readText(assets, "$ASSET_ROOT/asset-manifest.json"))
    check(manifest.getString("schema") == "sagejs.mobile-runtime-assets/v1")
    val productionIdentity = manifest.getString("productionIdentity")
    val paths = mutableSetOf<String>()
    val records = mutableMapOf<String, JSONObject>()
    val manifestAssets = manifest.getJSONArray("assets")
    for (index in 0 until manifestAssets.length()) {
      val record = manifestAssets.getJSONObject(index)
      val path = record.getString("path")
      check(LoopbackHttpPolicy.decodeAssetPath("/cap/$path", "cap") == path) { "unsafe runtime asset path" }
      check(paths.add(path)) { "duplicate runtime asset path" }
      val bytes = assets.open("$ASSET_ROOT/$path", AssetManager.ACCESS_STREAMING).use { it.readBytes() }
      check(bytes.size.toLong() == record.getLong("bytes")) { "runtime asset size mismatch: $path" }
      check(sha256(bytes) == record.getString("sha256")) { "runtime asset digest mismatch: $path" }
      records[path] = record
    }
    val production = JSONObject(readText(assets, "$ASSET_ROOT/sagejs/production-manifest.json"))
    val receipt = JSONObject(readText(assets, "$ASSET_ROOT/sagejs/build-receipt.json"))
    check(production.getString("schema") == "sagejs.wasm-production-artifact/v1")
    check(receipt.getString("schema") == "sagejs.wasm-build-receipt/v1")
    check(production.getString("identity") == productionIdentity)
    check(receipt.getJSONObject("artifact").getString("identity") == productionIdentity)
    val productionAssets = production.getJSONArray("assets")
    for (index in 0 until productionAssets.length()) {
      val record = productionAssets.getJSONObject(index)
      val mobile = records["sagejs/dist/${record.getString("path")}"]
        ?: error("production asset missing from mobile closure")
      check(mobile.getLong("bytes") == record.getLong("bytes"))
      check(mobile.getString("sha256") == record.getString("sha256"))
    }
    check(paths.contains("index.html"))
    return VerifiedRuntimeAssets(productionIdentity, paths)
  }

  private fun readText(assets: AssetManager, path: String): String =
    assets.open(path).bufferedReader(StandardCharsets.UTF_8).use { it.readText() }

  private fun sha256(bytes: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
