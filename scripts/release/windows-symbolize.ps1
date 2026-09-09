param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [Parameter(Mandatory=$true)][string]$SymbolDirectory,
  [Parameter(Mandatory=$true)][string]$ImageBase,
  [Parameter(Mandatory=$true)][string[]]$Addresses
)
$ErrorActionPreference = 'Stop'
# Read-only symbol lookup against the caller's explicitly supplied binary/PDB.
# Never loads the executable as code, reads process memory, or uploads a dump.
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class SageSymbolLookup {
  [DllImport("dbghelp.dll", CharSet=CharSet.Ansi, SetLastError=true)]
  public static extern bool SymInitialize(IntPtr process, string path, bool invade);
  [DllImport("dbghelp.dll", SetLastError=true)]
  public static extern uint SymSetOptions(uint options);
  [DllImport("dbghelp.dll", CharSet=CharSet.Ansi, SetLastError=true)]
  public static extern ulong SymLoadModuleEx(IntPtr process, IntPtr file, string image, string module, ulong address, uint size, IntPtr data, uint flags);
  [DllImport("dbghelp.dll", SetLastError=true)]
  public static extern ulong SymGetModuleBase64(IntPtr process, ulong address);
  [DllImport("dbghelp.dll", SetLastError=true)]
  public static extern bool SymFromAddr(IntPtr process, ulong address, out ulong displacement, IntPtr symbol);
  [DllImport("dbghelp.dll")]
  public static extern bool SymCleanup(IntPtr process);
  public static string Lookup(IntPtr process, ulong address) {
    IntPtr info = Marshal.AllocHGlobal(88 + 1024);
    try {
      for(int i=0;i<88+1024;i++) Marshal.WriteByte(info,i,0);
      Marshal.WriteInt32(info,0,88);
      Marshal.WriteInt32(info,80,1024);
      ulong displacement;
      if(!SymFromAddr(process,address,out displacement,info))
        throw new Exception("Address 0x" + address.ToString("X") + ": " + new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()).Message);
      return Marshal.PtrToStringAnsi(IntPtr.Add(info,84),Marshal.ReadInt32(info,76)) + "+0x" + displacement.ToString("X");
    } finally { Marshal.FreeHGlobal(info); }
  }
}
'@
$handle = [System.Diagnostics.Process]::GetCurrentProcess().Handle
[void][SageSymbolLookup]::SymSetOptions(0x80206)
if(-not [SageSymbolLookup]::SymInitialize($handle,$SymbolDirectory,$false)) { throw 'SymInitialize failed' }
try {
  $bytes = [IO.File]::ReadAllBytes($Executable)
  $pe = [BitConverter]::ToInt32($bytes,0x3c)
  $imageSize = [BitConverter]::ToUInt32($bytes,$pe+80)
  $loaded = [SageSymbolLookup]::SymLoadModuleEx($handle,[IntPtr]::Zero,$Executable,'node',0x140000000,$imageSize,[IntPtr]::Zero,0)
  if($loaded -eq 0) { throw "Symbol load failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
  Write-Verbose ("Loaded symbol module at 0x" + $loaded.ToString('X'))
  $original = [Convert]::ToUInt64($ImageBase,16)
  foreach($address in $Addresses) {
    $rva = [Convert]::ToUInt64($address,16) - $original
    Write-Verbose ("Module lookup 0x" + [SageSymbolLookup]::SymGetModuleBase64($handle,$loaded+$rva).ToString('X'))
    [PSCustomObject]@{ address=$address; rva=$rva.ToString('X'); symbol=[SageSymbolLookup]::Lookup($handle,$loaded+$rva) } | ConvertTo-Json -Compress
  }
} finally { [void][SageSymbolLookup]::SymCleanup($handle) }
