set(VCPKG_TARGET_ARCHITECTURE x64)
set(VCPKG_CRT_LINKAGE static)
set(VCPKG_LIBRARY_LINKAGE static)
set(VCPKG_BUILD_TYPE release)

# OpenBLAS cannot use its dynamic CPU dispatcher in a native MSVC build.
# Build its portable x86-64 kernel instead of specializing release artifacts
# for whichever GitHub runner or developer VM happened to compile them.
if(PORT STREQUAL "openblas")
    set(VCPKG_CMAKE_CONFIGURE_OPTIONS "-DTARGET=GENERIC")
endif()
