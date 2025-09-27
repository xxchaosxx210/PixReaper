@echo off
setlocal

:: Name with timestamp so old exports aren’t overwritten
for /f "tokens=1-4 delims=/ " %%a in ("%date%") do (
    set YYYY=%%d
    set MM=%%b
    set DD=%%c
)
set ZIPNAME=PixReaper-%YYYY%-%MM%-%DD%.zip

:: Remove old zip if exists
if exist "%ZIPNAME%" del "%ZIPNAME%"

echo Creating zip archive: %ZIPNAME%

:: Build file list excluding node_modules, .git, .vscode
powershell -command ^
    "Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch '\\node_modules\\|\\.git\\|\\.vscode\\' } | Compress-Archive -DestinationPath '%ZIPNAME%' -Force"

echo.
echo Copying project file structure to clipboard...

:: Create tree and filter unwanted folders
(
    dir /s /b ^
    | findstr /V /I "\\node_modules\\" ^
    | findstr /V /I "\\.vscode\\" ^
    | findstr /V /I "\\.git\\"
) | clip

echo Done!
echo - %ZIPNAME% created in current folder
echo - File structure copied to clipboard (Ctrl+V to paste here)
pause
