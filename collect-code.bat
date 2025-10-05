@echo off
setlocal

:: ============================================================
:: Default values
:: ============================================================
set "ROOT=%cd%"
set "OUTFILE=%cd%\collected-code.txt"
set "EXTS=.js,.json,.html,.css,.ts"
set "SHOWHELP="

:: ============================================================
:: Parse command-line flags
:: ============================================================
:parse
if "%~1"=="" goto after_parse

if /i "%~1"=="-h" (
    set "SHOWHELP=1"
    shift
    goto after_parse
)

if /i "%~1"=="-r" (
    set "ROOT=%~2"
    shift & shift
    goto parse
)

if /i "%~1"=="-o" (
    set "OUTFILE=%~2"
    shift & shift
    goto parse
)

if /i "%~1"=="-e" (
    set "EXTS=%~2"
    shift & shift
    goto parse
)

shift
goto parse

:after_parse
if defined SHOWHELP goto :show_help

:: ============================================================
:: Info banner
:: ============================================================
echo ------------------------------------------------------------
echo  Collecting code files...
echo ------------------------------------------------------------
echo Root folder : %ROOT%
echo Output file : %OUTFILE%
echo Extensions  : %EXTS%
echo ------------------------------------------------------------
echo.

:: ============================================================
:: PowerShell inline logic (with counts)
:: ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$Root = '%ROOT%';" ^
  "$OutFile = '%OUTFILE%';" ^
  "$ignoreFolders = @('node_modules', '.git', '.vscode', 'dist', 'build');" ^
  "$extensions = @('%EXTS%'.Split(',') | ForEach-Object { $_.Trim() });" ^
  "$fileCount = 0; $lineCount = 0;" ^
  "function Test-IsTextFile($Path) { " ^
  "  try { $bytes = Get-Content -Path $Path -Encoding Byte -TotalCount 200 -ErrorAction Stop; " ^
  "    if (-not $bytes) { return $true }; " ^
  "    foreach ($b in $bytes) { " ^
  "      if (($b -lt 9 -and $b -ne 9 -and $b -ne 10 -and $b -ne 13) -or $b -gt 126) { return $false } };" ^
  "    return $true } catch { return $false } };" ^
  "$out = ''; " ^
  "Get-ChildItem -Path $Root -Recurse -File | Where-Object { " ^
  "  $include=$true; foreach ($ignore in $ignoreFolders) { " ^
  "    if ($_.FullName -match ('\\' + [regex]::Escape($ignore) + '(\\|$)')) { $include=$false; break } };" ^
  "  $extOK = $extensions -contains $_.Extension.ToLower(); " ^
  "  $include -and $extOK } | ForEach-Object { " ^
  "  if (Test-IsTextFile $_.FullName) { " ^
  "    $fileCount++; " ^
  "    $text = Get-Content -Raw -Path $_.FullName; " ^
  "    $lines = ($text -split \"`r?`n\").Count; " ^
  "    $lineCount += $lines; " ^
  "    Write-Host ('Processing ' + $_.FullName + ' [' + $lines + ' lines]'); " ^
  "    $out += ('='*43 + \"`r`nFile: \" + $_.FullName + \"`r`nLines: \" + $lines + \"`r`n`r`n\"); " ^
  "    $out += $text + \"`r`n`r`n\" } };" ^
  "if ($out) { " ^
  "  $summary = ('='*43 + \"`r`nTotal files: $fileCount`r`nTotal lines: $lineCount`r`n`r`n\"); " ^
  "  $out += $summary; " ^
  "  Set-Content -Path $OutFile -Value $out -Encoding UTF8; " ^
  "  Write-Host ('`n✅ Done! Saved to ' + $OutFile); " ^
  "  Write-Host ('Total files processed: ' + $fileCount); " ^
  "  Write-Host ('Total lines counted:  ' + $lineCount) } " ^
  "else { Write-Host '⚠️  No text files matched.' }"

endlocal
exit /b


:: ============================================================
:: Helper Section (-h)
:: ============================================================
:show_help
echo ============================================================
echo  collect-code.bat  —  Combine code/text files recursively
echo ============================================================
echo.
echo  DESCRIPTION:
echo    Scans a folder and its subfolders for code files with
echo    specific extensions, then combines them into one UTF-8
echo    text file. Each file is preceded by its full path and
echo    line count.  The script also prints a final summary of
echo    total files processed and total lines counted.
echo.
echo  SYNTAX:
echo    collect-code [options]
echo.
echo  OPTIONS:
echo    -r [folder]   Root directory to scan (default: current)
echo    -o [file]     Output file path (default: collected-code.txt)
echo    -e [exts]     Comma-separated extensions to include
echo                   e.g. ".js,.ts,.json,.html,.css"
echo    -h            Show this help information
echo.
echo  NOTES:
echo    • Existing output files are OVERWRITTEN each run.
echo      (Change Set-Content to Add-Content in the script to append instead.)
echo    • These folders are ignored automatically:
echo         node_modules, .git, .vscode, dist, build
echo    • Output is UTF-8 encoded.
echo.
echo  OUTPUT SUMMARY:
echo    - Total files processed
echo    - Total lines of code counted
echo    - Combined file written to the chosen output file
echo.
echo  EXAMPLES:
echo    collect-code
echo       → Scan current folder with defaults.
echo.
echo    collect-code -r "C:\dev\PixReaper"
echo       → Scan that project folder.
echo.
echo    collect-code -r . -o allcode.txt
echo       → Save combined file as allcode.txt.
echo.
echo    collect-code -r . -e ".js,.ts,.json"
echo       → Include only JavaScript, TypeScript, and JSON.
echo.
echo    collect-code -r "C:\dev" -o output.txt -e ".py,.bat"
echo       → Combine Python and batch scripts only.
echo ============================================================
exit /b 0
