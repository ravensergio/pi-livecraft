' Runs Pi Livecraft hidden (same user session), root process named "livecraft.exe"
Set sh = CreateObject("Wscript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Skip if already running
Set procs = GetObject("winmgmts:").ExecQuery("Select ProcessId From Win32_Process Where Name='livecraft.exe'")
If procs.Count > 0 Then WScript.Quit

' Find node.exe and mirror it as livecraft.exe (kept in sync with node version)
Set p = sh.Exec("cmd /c where node.exe")
line = ""
Do While Not p.StdOut.AtEndOfStream
  line = p.StdOut.ReadLine()
  If Len(Trim(line)) > 0 Then Exit Do
Loop
nodeExe = Trim(line)
nvmDir = fso.GetParentFolderName(nodeExe)
livecraftExe = nvmDir & "\livecraft.exe"
If Not fso.FileExists(livecraftExe) _
   Or fso.GetFile(livecraftExe).DateLastModified < fso.GetFile(nodeExe).DateLastModified Then
  fso.CopyFile nodeExe, livecraftExe, True
End If

sh.CurrentDirectory = "E:\z_Working_PI\00-web-pi-livecraft"
sh.Run """" & livecraftExe & """ """ & nvmDir & "\node_modules\npm\bin\npm-cli.js"" run dev", 0, False
