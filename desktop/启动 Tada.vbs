Option Explicit
Dim shell, files, folder
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
folder = files.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = folder
shell.Run "node scripts/desktop.mjs", 0, False

' Tada explicit-open reveal: show the running task panel without discarding any records.
Dim revealCommand
revealCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & folder & "\scripts\open-tada.ps1"""
shell.Run revealCommand, 0, False
