import CryptoKit
import Darwin
import Foundation
import React
import Security

private struct RuntimeOriginDescription {
  let url: String
  let root: String
  let origin: String
  let productionIdentity: String

  var dictionary: [String: String] {
    ["url": url, "root": root, "origin": origin, "productionIdentity": productionIdentity]
  }
}

private enum RuntimeOriginError: Error, LocalizedError {
  case invalidAsset(String)
  case socket(String)

  var errorDescription: String? {
    switch self {
    case .invalidAsset(let message): return message
    case .socket(let message): return message
    }
  }
}

private final class RuntimeOriginServer {
  static let shared = RuntimeOriginServer()

  private let lock = NSLock()
  private let queue = DispatchQueue(label: "org.sagemath.sagejs.runtime-origin", attributes: .concurrent)
  private var descriptor: Int32 = -1
  private var source: DispatchSourceRead?
  private var description: RuntimeOriginDescription?
  private var allowlist: Set<String> = []
  private var capability = ""
  private var runtimeRoot: URL?

  func start() throws -> RuntimeOriginDescription {
    lock.lock()
    defer { lock.unlock() }
    if let description { return description }

    let verified = try verifyAssets()
    var random = [UInt8](repeating: 0, count: 32)
    let randomStatus = random.withUnsafeMutableBytes {
      SecRandomCopyBytes(kSecRandomDefault, $0.count, $0.baseAddress!)
    }
    guard randomStatus == errSecSuccess else {
      throw RuntimeOriginError.socket("secure random capability generation failed")
    }
    let nextCapability = random.map { String(format: "%02x", $0) }.joined()
    let fd = Darwin.socket(AF_INET, SOCK_STREAM, 0)
    guard fd >= 0 else { throw RuntimeOriginError.socket("socket() failed") }
    var yes: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout.size(ofValue: yes)))
    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = in_port_t(0)
    address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
    let bound = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    guard bound == 0, Darwin.listen(fd, 32) == 0 else {
      Darwin.close(fd)
      throw RuntimeOriginError.socket("could not bind runtime server to 127.0.0.1")
    }
    fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK)
    var local = sockaddr_in()
    var localLength = socklen_t(MemoryLayout<sockaddr_in>.size)
    let named = withUnsafeMutablePointer(to: &local) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        getsockname(fd, $0, &localLength)
      }
    }
    guard named == 0, local.sin_addr.s_addr == inet_addr("127.0.0.1") else {
      Darwin.close(fd)
      throw RuntimeOriginError.socket("runtime server escaped loopback")
    }
    let port = UInt16(bigEndian: local.sin_port)
    let origin = "http://127.0.0.1:\(port)"
    let root = "\(origin)/\(nextCapability)/"
    let result = RuntimeOriginDescription(
      url: "\(root)index.html",
      root: root,
      origin: origin,
      productionIdentity: verified.identity
    )
    descriptor = fd
    allowlist = verified.paths
    capability = nextCapability
    runtimeRoot = verified.root
    description = result

    let readSource = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
    readSource.setEventHandler { [weak self] in self?.acceptConnections(fd: fd) }
    source = readSource
    readSource.resume()
    return result
  }

  func stop() {
    lock.lock()
    let fd = descriptor
    descriptor = -1
    description = nil
    allowlist = []
    capability = ""
    runtimeRoot = nil
    let activeSource = source
    source = nil
    lock.unlock()
    activeSource?.cancel()
    if fd >= 0 { Darwin.close(fd) }
  }

  private func acceptConnections(fd: Int32) {
    while true {
      let client = Darwin.accept(fd, nil, nil)
      if client < 0 { return }
      queue.async { [weak self] in self?.serve(client: client) }
    }
  }

  private func serve(client: Int32) {
    defer { Darwin.close(client) }
    var noSignal: Int32 = 1
    setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout.size(ofValue: noSignal)))
    var timeout = timeval(tv_sec: 5, tv_usec: 0)
    setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout.size(ofValue: timeout)))
    guard let header = readHeader(client: client),
          let first = header.components(separatedBy: "\r\n").first else { return }
    let parts = first.split(separator: " ", omittingEmptySubsequences: false).map(String.init)
    guard parts.count == 3, parts[2] == "HTTP/1.1" else {
      send(client: client, status: "400 Bad Request", path: nil, data: Data(), head: false)
      return
    }
    let head = parts[0] == "HEAD"
    guard head || parts[0] == "GET" else {
      send(client: client, status: "405 Method Not Allowed", path: nil, data: Data(), head: false)
      return
    }
    lock.lock()
    let path = decodeAssetPath(parts[1], capability: capability)
    let permitted = path.map(allowlist.contains) ?? false
    let root = runtimeRoot
    lock.unlock()
    guard let path, permitted, let root else {
      send(client: client, status: "404 Not Found", path: nil, data: Data(), head: false)
      return
    }
    let file = root.appendingPathComponent(path)
    guard let data = try? Data(contentsOf: file, options: [.mappedIfSafe]) else {
      send(client: client, status: "404 Not Found", path: nil, data: Data(), head: false)
      return
    }
    send(client: client, status: "200 OK", path: path, data: data, head: head)
  }

  private func send(client: Int32, status: String, path: String?, data: Data, head: Bool) {
    let cache = path == "index.html" ? "no-store" : "public, max-age=31536000, immutable"
    let header = """
    HTTP/1.1 \(status)\r
    Content-Length: \(data.count)\r
    Content-Type: \(path.map(mime) ?? "text/plain; charset=utf-8")\r
    Cache-Control: \(cache)\r
    Cross-Origin-Opener-Policy: same-origin\r
    Cross-Origin-Embedder-Policy: require-corp\r
    Cross-Origin-Resource-Policy: same-origin\r
    Content-Security-Policy: \(Self.csp)\r
    X-Content-Type-Options: nosniff\r
    Referrer-Policy: no-referrer\r
    Permissions-Policy: camera=(), microphone=(), geolocation=()\r
    Connection: close\r
    \r

    """
    writeAll(client: client, data: Data(header.utf8))
    if !head { writeAll(client: client, data: data) }
  }

  private func writeAll(client: Int32, data: Data) {
    data.withUnsafeBytes { bytes in
      guard let base = bytes.baseAddress else { return }
      var offset = 0
      while offset < bytes.count {
        let count = Darwin.send(client, base.advanced(by: offset), bytes.count - offset, 0)
        if count <= 0 { return }
        offset += count
      }
    }
  }

  private func readHeader(client: Int32) -> String? {
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 4096)
    while data.count <= 65_536 {
      let count = buffer.withUnsafeMutableBytes {
        Darwin.recv(client, $0.baseAddress, $0.count, 0)
      }
      if count <= 0 { return nil }
      data.append(contentsOf: buffer.prefix(count))
      if data.range(of: Data("\r\n\r\n".utf8)) != nil {
        return String(data: data, encoding: .ascii)
      }
    }
    return nil
  }

  private func verifyAssets() throws -> (identity: String, paths: Set<String>, root: URL) {
    guard let root = Bundle.main.resourceURL?.appendingPathComponent("runtime", isDirectory: true) else {
      throw RuntimeOriginError.invalidAsset("bundled runtime directory is missing")
    }
    let manifest = try json(root.appendingPathComponent("asset-manifest.json"))
    guard manifest["schema"] as? String == "sagejs.mobile-runtime-assets/v1",
          let identity = manifest["productionIdentity"] as? String,
          let assets = manifest["assets"] as? [[String: Any]] else {
      throw RuntimeOriginError.invalidAsset("mobile runtime manifest is invalid")
    }
    var paths = Set<String>()
    var records: [String: [String: Any]] = [:]
    for record in assets {
      guard let path = record["path"] as? String,
            decodeAssetPath("/cap/\(path)", capability: "cap") == path,
            paths.insert(path).inserted,
            let bytes = record["bytes"] as? NSNumber,
            let digest = record["sha256"] as? String else {
        throw RuntimeOriginError.invalidAsset("mobile runtime contains an unsafe asset record")
      }
      let file = root.appendingPathComponent(path)
      let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
      guard values.isRegularFile == true, values.isSymbolicLink != true,
            file.standardizedFileURL.path.hasPrefix(root.standardizedFileURL.path + "/") else {
        throw RuntimeOriginError.invalidAsset("runtime asset escaped its bundle root")
      }
      let data = try Data(contentsOf: file, options: [.mappedIfSafe])
      guard data.count == bytes.intValue, sha256(data) == digest else {
        throw RuntimeOriginError.invalidAsset("runtime asset digest mismatch: \(path)")
      }
      records[path] = record
    }
    let production = try json(root.appendingPathComponent("sagejs/production-manifest.json"))
    let receipt = try json(root.appendingPathComponent("sagejs/build-receipt.json"))
    guard production["schema"] as? String == "sagejs.wasm-production-artifact/v1",
          receipt["schema"] as? String == "sagejs.wasm-build-receipt/v1",
          production["identity"] as? String == identity,
          (receipt["artifact"] as? [String: Any])?["identity"] as? String == identity,
          let productionAssets = production["assets"] as? [[String: Any]] else {
      throw RuntimeOriginError.invalidAsset("build receipt does not attest the mobile production artifact")
    }
    for record in productionAssets {
      guard let path = record["path"] as? String,
            let mobile = records["sagejs/dist/\(path)"],
            (mobile["bytes"] as? NSNumber) == (record["bytes"] as? NSNumber),
            mobile["sha256"] as? String == record["sha256"] as? String else {
        throw RuntimeOriginError.invalidAsset("production closure is incomplete")
      }
    }
    guard paths.contains("index.html") else {
      throw RuntimeOriginError.invalidAsset("runtime entry document is missing")
    }
    return (identity, paths, root)
  }

  private func json(_ url: URL) throws -> [String: Any] {
    guard let value = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] else {
      throw RuntimeOriginError.invalidAsset("invalid JSON asset: \(url.lastPathComponent)")
    }
    return value
  }

  private func sha256(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  private func decodeAssetPath(_ target: String, capability: String) -> String? {
    guard !target.contains("?"), !target.contains("#"), !target.contains("\0") else { return nil }
    let prefix = "/\(capability)/"
    guard target.hasPrefix(prefix),
          let decoded = target.dropFirst(prefix.count).removingPercentEncoding,
          !decoded.isEmpty, !decoded.hasPrefix("/"), !decoded.contains("\\"), !decoded.contains("\0") else {
      return nil
    }
    let components = decoded.split(separator: "/", omittingEmptySubsequences: false)
    guard components.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else { return nil }
    return decoded
  }

  private func mime(_ path: String) -> String {
    if path.hasSuffix(".html") { return "text/html; charset=utf-8" }
    if path.hasSuffix(".mjs") || path.hasSuffix(".js") { return "text/javascript; charset=utf-8" }
    if path.hasSuffix(".wasm") { return "application/wasm" }
    if path.hasSuffix(".json") { return "application/json; charset=utf-8" }
    if path.hasSuffix(".css") { return "text/css; charset=utf-8" }
    if path.hasSuffix(".svg") { return "image/svg+xml" }
    if path.hasSuffix(".png") { return "image/png" }
    return "application/octet-stream"
  }

  private static let csp = "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; " +
    "worker-src 'self' blob:; connect-src 'self'; img-src 'self' data: blob:; " +
    "style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; " +
    "base-uri 'none'; frame-ancestors 'none'"
}

@objc(SageRuntimeOrigin)
final class SageRuntimeOrigin: NSObject {
  static func stopRuntimeServer() {
    RuntimeOriginServer.shared.stop()
  }

  @objc(start:rejecter:)
  func start(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    do {
      resolve(try RuntimeOriginServer.shared.start().dictionary)
    } catch {
      reject("E_RUNTIME_ORIGIN", error.localizedDescription, error)
    }
  }

  @objc(stop:rejecter:)
  func stop(
    _ resolve: RCTPromiseResolveBlock,
    rejecter _: RCTPromiseRejectBlock
  ) {
    RuntimeOriginServer.shared.stop()
    resolve(nil)
  }

  @objc static func requiresMainQueueSetup() -> Bool { false }
}
