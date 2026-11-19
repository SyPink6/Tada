$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$launchFolder = Join-Path $projectRoot 'work\launches'
if (-not (Test-Path -LiteralPath $launchFolder)) {
    [void][System.IO.Directory]::CreateDirectory($launchFolder)
}
$launchId = (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + $PID
$logFile = Join-Path $launchFolder ($launchId + '.log')
function Write-LaunchLog([string]$message) {
    [System.IO.File]::AppendAllText($logFile, ((Get-Date -Format 'o') + ' ' + $message + [Environment]::NewLine))
}

try {
    Write-LaunchLog 'Opening Tada; existing task records will be preserved.'
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class TadaLauncherWindow {
    public IntPtr Handle;
    public string Title;
    public int Width;
    public int Height;
    public bool Visible;
    public delegate bool EnumProc(IntPtr hwnd, IntPtr param);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr param);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder title, int count);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out Rect rectangle);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hwnd, int command);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll", EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr hwnd, int index);
    struct Rect {public int Left,Top,Right,Bottom;}
    public static TadaLauncherWindow[] Find(int processId) {
        var result = new List<TadaLauncherWindow>();
        EnumWindows((handle, unused) => {
            uint owner; GetWindowThreadProcessId(handle, out owner);
            if(owner == processId) {
                var title = new StringBuilder(512); GetWindowText(handle, title, 512);
                Rect rect; GetWindowRect(handle, out rect);
                if(title.ToString().Contains("Tada")) result.Add(new TadaLauncherWindow {
                    Handle=handle,Title=title.ToString(),Width=rect.Right-rect.Left,
                    Height=rect.Bottom-rect.Top,Visible=IsWindowVisible(handle)
                });
            }
            return true;
        },IntPtr.Zero);
        return result.ToArray();
    }
    public static void Reveal(IntPtr handle) {
        bool wasOnTop=(GetWindowLong(handle,-20)&8)!=0;
        ShowWindowAsync(handle,9);
        SetWindowPos(handle,new IntPtr(-1),0,0,0,0,0x43);
        if(!wasOnTop) SetWindowPos(handle,new IntPtr(-2),0,0,0,0,0x43);
        SetForegroundWindow(handle);
    }
}
'@

    $runtimePath = Join-Path $projectRoot 'runtimes\electron-45.3.4\electron.exe'
    if (-not (Test-Path -LiteralPath $runtimePath)) { throw 'Tada runtime is missing. Please keep desktop-v0.1 and desktop together.' }
    function Find-TadaProcess {
        @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object {
            $_.ExecutablePath -and
            [string]::Equals($_.ExecutablePath, $runtimePath, [StringComparison]::OrdinalIgnoreCase) -and
            $_.CommandLine -notmatch '--type='
        })
    }
    $running = @(Find-TadaProcess)
    if ($running.Count -eq 0) {
        $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { 'D:\APP\nodejs\node.exe' }
        if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js could not be found.' }
        $stdout = Join-Path $launchFolder ($launchId + '-app.log')
        $stderr = Join-Path $launchFolder ($launchId + '-error.log')
        if ((Test-Path -LiteralPath $stdout) -or (Test-Path -LiteralPath $stderr)) { throw 'Launch log already exists; preserving it.' }
        $started = Start-Process -FilePath $nodePath -ArgumentList @('scripts/desktop.mjs') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        Write-LaunchLog ('Started launcher process ' + $started.Id)
    } else {
        Write-LaunchLog ('Found existing Tada process: ' + (($running | ForEach-Object ProcessId) -join ','))
    }

    $revealed = $false
    for ($attempt=0; $attempt -lt 80; $attempt++) {
        $running = @(Find-TadaProcess)
        foreach ($process in $running) {
            $windows = @([TadaLauncherWindow]::Find([int]$process.ProcessId))
            $pet = @($windows | Where-Object { $_.Width -lt 350 -and $_.Height -lt 400 })
            $panels = @($windows | Where-Object { $_.Width -ge 350 -and $_.Height -ge 400 })
            if ($panels.Count -gt 0) {
                foreach ($window in $pet) { [TadaLauncherWindow]::Reveal($window.Handle) }
                [TadaLauncherWindow]::Reveal($panels[0].Handle)
                Write-LaunchLog ('Revealed task panel for process ' + $process.ProcessId)
                $revealed = $true
                break
            }
        }
        if ($revealed) { break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $revealed) { throw 'Tada did not show its task panel within 20 seconds. See the launch logs.' }
    Write-LaunchLog 'Success: Tada is open. Minimize the task card to return to quiet companionship.'
} catch {
    Write-LaunchLog ('ERROR: ' + $_.Exception.Message)
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show("Tada could not open.`r`n`r`n$($_.Exception.Message)`r`n`r`nLog: $logFile", 'Tada launch', 'OK', 'Warning')
    exit 1
}

# Keep the mascot and task card in the same window layer after native recovery.
. (Join-Path $PSScriptRoot 'sync-window-pins.ps1')
