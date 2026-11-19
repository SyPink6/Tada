# This is appended to the launch flow so native recovery respects one saved setting.
$ErrorActionPreference = 'Stop'
$pinProject = Split-Path -Parent $PSScriptRoot
$pinHistory = Join-Path $pinProject 'data\companion-history.jsonl'
$pinEnabled = $false
if (Test-Path -LiteralPath $pinHistory) {
    $pinSnapshot = Get-Content -LiteralPath $pinHistory -Tail 1 -Encoding UTF8 | ConvertFrom-Json
    $pinEnabled = [bool]$pinSnapshot.preferences.onTop
}
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class TadaNativePinSync {
 [DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll",EntryPoint="GetWindowLongW")]public static extern int GetWindowLong(IntPtr h,int index);
 public static bool IsPinned(IntPtr h){return (GetWindowLong(h,-20)&8)!=0;}
 public static void Apply(IntPtr h,bool enabled){if(!SetWindowPos(h,new IntPtr(enabled?-1:-2),0,0,0,0,0x13))throw new Exception("Could not synchronize Tada pin state.");}
}
'@
$pinProcesses = @(Find-TadaProcess)
foreach ($pinProcess in $pinProcesses) {
    $pinWindows = @([TadaLauncherWindow]::Find([int]$pinProcess.ProcessId))
    foreach ($pinWindow in $pinWindows) { [TadaNativePinSync]::Apply($pinWindow.Handle,$pinEnabled) }
    foreach ($pinWindow in $pinWindows) {
        if ([TadaNativePinSync]::IsPinned($pinWindow.Handle) -ne $pinEnabled) {throw 'Tada native pin state did not match the saved preference.'}
    }
    Write-LaunchLog ('Both windows synchronized to saved pin preference: ' + $pinEnabled)
}
