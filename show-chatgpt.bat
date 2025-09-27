@echo off
setlocal

:: Name of the zip file
set ZIPNAME=PixReaper-export.zip

:: Exclude folders we don't want
set EXCLUDES=node_modules .vscode .git

:: Delete old zip if it exists
if exist "%ZIPNAME%" del "%ZIPNAME%"

echo Creating zip archive: %ZIPNAME%
:: Use PowerShell's Compress-Archive (built into Windows 10+)
powershell -command "Compress-Archive -Path * -DestinationPath '%ZIPNAME%' -Force -CompressionLevel Optimal -Exclude %EXCLUDES%"

echo.
echo Copying project file structure to clipboard...

:: Generate tree, ignore unwanted folders, copy to clipboard
(
    dir /s /b ^
    | findstr /V /I "\\node_modules\\" ^
    | findstr /V /I "\\.vscode\\" ^
    | findstr /V /I "\\.git\\"
) | clip

echo Done!
echo - %ZIPNAME% created in current folder
echo - File structure copied to clipboard, ready to paste here
pause
