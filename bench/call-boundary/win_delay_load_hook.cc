// Adapted from node-gyp's MIT-licensed win_delay_load_hook.cc. A Node-API
// addon must resolve the stable ABI from whichever compatible executable is
// hosting it, rather than binding eagerly to a file literally named node.exe.
#ifdef _MSC_VER

#pragma managed(push, off)

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>
#include <delayimp.h>
#include <string.h>

static FARPROC WINAPI load_executable_hook(
    unsigned int event,
    DelayLoadInfo *information
) {
    HMODULE module;
    if (event != dliNotePreLoadLibrary) return NULL;
    if (_stricmp(information->szDll, "node.exe") != 0) return NULL;
    module = GetModuleHandle(TEXT("libnode.dll"));
    if (module == NULL) module = GetModuleHandle(NULL);
    return (FARPROC)module;
}

decltype(__pfnDliNotifyHook2) __pfnDliNotifyHook2 = load_executable_hook;

#pragma managed(pop)

#endif
