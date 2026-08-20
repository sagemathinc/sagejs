package org.sagemath.sagejs

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class SageRuntimeOriginPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(SageRuntimeOriginModule(context))

  override fun createViewManagers(
    context: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
