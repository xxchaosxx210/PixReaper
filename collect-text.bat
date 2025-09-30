@echo off
setlocal

:: Default root folder is current dir, or pass one in as argument
set "ROOT=%~1"
if "%ROOT%"=="" set "ROOT=%cd%"

:: Output file (in the current directory)
set "OUTFILE=%cd%\collected-code.txt"

:: Call PowerShell with the full script inline
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$Root = '%ROOT%';" ^
  "$OutFile = '%OUTFILE%';" ^
  "$ignoreFolders = @('node_modules', '.git', '.vscode', 'dist', 'build');" ^
  "$extensions = @('.js''.json','.html','.css');" ^
  "function Test-IsTextFile($Path) { try { $bytes = Get-Content -Path $Path -Encoding Byte -TotalCount 200 -ErrorAction Stop; if (-not $bytes) { return $true }; foreach ($b in $bytes) { if (($b -lt 9 -and $b -ne 9 -and $b -ne 10 -and $b -ne 13) -or $b -gt 126) { return $false } }; return $true } catch { return $false } };" ^
  "$out = '';" ^
  "Get-ChildItem -Path $Root -Recurse -File | Where-Object { $include=$true; foreach ($ignore in $ignoreFolders) { if ($_.FullName -match ('\\' + [regex]::Escape($ignore) + '(\\|$)')) { $include=$false; break } }; $extOK = $extensions -contains $_.Extension.ToLower(); $include -and $extOK } | ForEach-Object { if (Test-IsTextFile $_.FullName) { Write-Host ('Processing ' + $_.FullName); $out += ('='*43 + \"`r`nFile: \" + $_.FullName + \"`r`n`r`n\"); $out += (Get-Content -Raw -Path $_.FullName) + \"`r`n`r`n\" } };" ^
  "if ($out) { Set-Content -Path $OutFile -Value $out -Encoding UTF8; Write-Host ('✅ Done! Saved to ' + $OutFile) } else { Write-Host '⚠️ No text files matched.' }"

pause
