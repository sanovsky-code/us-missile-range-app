@echo off
REM US Defense Range Map - Windows launcher
REM Run this from the project root. It will:
REM   1. Verify Node.js is installed
REM   2. Install npm dependencies on first run (and rebuild native bindings
REM      if the project was copied from a different machine)
REM   3. Build the SQLite database from the Excel file on first run
REM   4. Start the production server and open the browser

setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo Node.js is not installed or not on PATH.
    echo Install Node.js 20 or newer from https://nodejs.org and run this file again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies. This only happens once and takes a few minutes...
    call npm install
    if errorlevel 1 (
        echo.
        echo npm install failed. See the messages above.
        pause
        exit /b 1
    )
) else (
    REM node_modules already present. Quickly verify the native sqlite binding
    REM loads on this machine - if not, rebuild it. This handles the case where
    REM someone copied the project (including node_modules) from a different
    REM machine or upgraded Node.js.
    node -e "require('better-sqlite3')" >nul 2>nul
    if errorlevel 1 (
        echo Rebuilding native modules for this machine...
        call npm rebuild better-sqlite3
        if errorlevel 1 (
            echo.
            echo npm rebuild failed. Delete the node_modules folder and run start.bat again.
            pause
            exit /b 1
        )
    )
)

if not exist "data\app.db" (
    if exist "data\us_missile_range_data.xlsx" (
        echo Building the database from data\us_missile_range_data.xlsx...
        call npm run db:import
        if errorlevel 1 (
            echo.
            echo Database import failed. See the messages above.
            pause
            exit /b 1
        )
    ) else (
        echo.
        echo Neither data\app.db nor data\us_missile_range_data.xlsx was found.
        echo Place one of them in the data\ folder and re-run start.bat.
        echo.
        pause
        exit /b 1
    )
)

if not exist ".next" (
    echo First-time build...
    call npm run build
    if errorlevel 1 (
        echo Build failed. See the messages above.
        pause
        exit /b 1
    )
)

echo.
echo Starting the app at http://127.0.0.1:3000
echo Close this window to stop the app.
echo.

REM Open the browser shortly after startup. The server takes ~2 seconds to be ready.
start "" cmd /c "timeout /t 3 >nul && start http://127.0.0.1:3000"

call npm start

endlocal
