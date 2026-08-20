package org.sagemath.sagejs

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SageRuntimeOriginModule(context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {
  override fun getName(): String = "SageRuntimeOrigin"

  @ReactMethod
  fun start(promise: Promise) {
    try {
      val description = SageRuntimeOriginServer.start(reactApplicationContext.assets)
      promise.resolve(
        Arguments.createMap().apply {
          putString("url", description.url)
          putString("root", description.root)
          putString("origin", description.origin)
          putString("productionIdentity", description.productionIdentity)
        },
      )
    } catch (error: Throwable) {
      promise.reject("E_RUNTIME_ORIGIN", error.message, error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    SageRuntimeOriginServer.stop()
    promise.resolve(null)
  }

  override fun invalidate() {
    SageRuntimeOriginServer.stop()
    super.invalidate()
  }
}
