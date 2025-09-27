@echo off
:: Prevents commands themselves from being displayed in the console output.

setlocal
:: Ensures variables set inside this script don’t leak into the parent environment.

:: ------------------------------
:: Create a timestamped zip name
:: ------------------------------
:: The FOR loop splits %date% into tokens (depending on your system locale, tokens might be in different order).
:: Here it assumes format like: "Sat 09/28/2025"
::   %%a = DayOfWeek
::   %%b = Month
::   %%c = Day
::   %%d = Year
for /f "tokens=1-4 delims=/ " %%a in ("%date%") do (
    set YYYY=%%d
    set MM=%%b
    set DD=%%c
)

:: Build the zip filename with date parts
set ZIPNAME=PixReaper-%YYYY%-%MM%-%DD%.zip

:: ------------------------------
:: Remove any old zip with same name
:: ------------------------------
if exist "%ZIPNAME%" del "%ZIPNAME%"

echo Creating zip archive: %ZIPNAME%

:: ------------------------------
:: Compress project files
:: ------------------------------
:: Use PowerShell to gather all files recursively,
:: exclude paths containing node_modules, .git, or .vscode,
:: then compress the rest into a zip archive.
powershell -command ^
    "Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch '\\node_modules\\|\\.git\\|\\.vscode\\' } | Compress-Archive -DestinationPath '%ZIPNAME%' -Force"

echo.
echo Copying project file structure to clipboard...

:: ------------------------------
:: Copy filtered file tree to clipboard
:: ------------------------------
:: dir /s /b = list files recursively in bare format
:: findstr filters out unwanted folders
:: clip copies the final output into the Windows clipboard
(
    dir /s /b ^
    | findstr /V /I "\\node_modules\\" ^
    | findstr /V /I "\\.vscode\\" ^
    | findstr /V /I "\\.git\\"
) | clip

:: ------------------------------
:: Wrap up
:: ------------------------------
echo Done!
echo - %ZIPNAME% created in current folder
echo - File structure copied to clipboard (Ctrl+V to paste here)

pause
:: Pauses so the console window stays open until you press a key
