const SAFE_LOCAL_SCHEMES = ['file:', 'sagejs-app:', 'about:'];

export function isAllowedRuntimeNavigation(
  url: string,
  runtimeRoot?: string,
): boolean {
  try {
    const parsed = new URL(url);
    if (!SAFE_LOCAL_SCHEMES.includes(parsed.protocol)) return false;
    if (parsed.protocol === 'about:') return parsed.href === 'about:blank';
    if (parsed.protocol === 'sagejs-app:') return parsed.hostname === 'runtime';
    return (
      !parsed.search &&
      !parsed.hash &&
      (!runtimeRoot || decodeURIComponent(parsed.href).startsWith(runtimeRoot))
    );
  } catch {
    return false;
  }
}
