<#
    Build the "ship to employees" zip.

    Output: dist/LapamRangesApp/ (and optionally dist/LapamRangesApp.zip)

    Run from the project root:
        powershell -ExecutionPolicy Bypass -File scripts/build-distribution.ps1

    Or via npm:
        npm run build:dist

    On the developer machine you need (one-time):
      - Node.js 20+ installed for the build step itself
      - Either a copy of the Windows x64 portable Node.js extracted under
        vendor/node-portable/ (so node-portable/node.exe exists), OR
        internet access so this script can download it automatically.

    What the script does:
      1. Stops any running local dev server (so the DB isn't locked).
      2. Refreshes data/app.db from data/us_missile_range_data.xlsx.
      3. Runs `next build` to produce .next/standalone/.
      4. Assembles dist/LapamRangesApp/ from the standalone output,
         .next/static, public/, data/app.db + xlsx, empty bucket dirs,
         portable Node.js, and a production start.bat + README.txt.
      5. Optionally writes dist/LapamRangesApp.zip.

    The resulting zip is ready to hand to employees. They extract it and
    double-click start.bat — no npm install, no Node setup, no terminal
    prompts.
#>

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Resolve project root (parent of this script).
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

# ---------- Tunables ----------
# CRITICAL: bundle the SAME Node major version the developer's `npm install`
# used. better-sqlite3 ships a native .node binary whose NODE_MODULE_VERSION
# must match the running Node ABI (Node 22 → ABI 127, Node 24 → ABI 137).
# Shipping a different major version produces "compiled against a different
# Node.js version" load errors at runtime.
# The script verifies the local node --version is the same major and aborts
# if not. If you must change this, also run a fresh `npm install` under the
# same major on the build machine before re-running build:dist.
$NodeVersion = "v24.13.1"            # match the developer's Node major.
$NodeArch    = "win-x64"
$AppFolder   = "LapamRangesApp"      # The folder the employees see after extract.
$DistRoot    = Join-Path $ProjectRoot "dist"
$AppOut      = Join-Path $DistRoot   $AppFolder
$VendorDir   = Join-Path $ProjectRoot "vendor"
$NodePortDir = Join-Path $VendorDir  "node-portable"
$MakeZip     = $true                 # set to $false to skip the final zip step.

function Section($title) {
    Write-Host ""
    Write-Host ("=" * 64) -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host ("=" * 64) -ForegroundColor Cyan
}

# ---------- 0. ABI sanity check ----------
# better-sqlite3's prebuilt .node file is compiled against whatever Node
# the developer's `npm install` ran under. The bundled portable Node MUST
# match the same major version or the binary won't load on employees'
# machines (NODE_MODULE_VERSION mismatch). Fail fast if they diverge.
$devNode = (& node --version).Trim()                # "v24.13.1"
$devMajor = ([regex]::Match($devNode, "^v(\d+)").Groups[1].Value)
$bundleMajor = ([regex]::Match($NodeVersion, "^v(\d+)").Groups[1].Value)
if ($devMajor -ne $bundleMajor) {
    Write-Error @"
Node version mismatch.
  This machine's Node:  $devNode  (major $devMajor)
  Bundle target:        $NodeVersion (major $bundleMajor)

better-sqlite3's native binary was compiled against Node $devMajor's ABI
during `npm install`. Shipping a Node $bundleMajor runtime would crash on
the employee's laptop with NODE_MODULE_VERSION errors.

Either:
  - Edit `\$NodeVersion` at the top of scripts/build-distribution.ps1 to a
    Node $devMajor.x version, or
  - Re-install Node $bundleMajor and rerun `npm install` before retrying.
"@
}

# ---------- 1. Stop any running dev server ----------
Section "Step 1/6  Stop running Node.js dev server (if any)"
# Compute this script's ancestor chain so we don't accidentally kill our
# own npm/cmd/powershell parents. If you invoke via `npm run build:dist`
# the npm host is a node process — killing it makes step 2's
# `npm run db:import` fail with "tsx not recognized" because the PATH
# inherited from npm (which adds node_modules/.bin) is gone.
$ancestors = @($PID)
$p = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
while ($p) {
    $ancestors += $p
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue
    if (-not $proc) { break }
    $p = $proc.ParentProcessId
}
Get-Process -Name node -ErrorAction SilentlyContinue |
    Where-Object { $ancestors -notcontains $_.Id } |
    ForEach-Object {
        Write-Host "  Stopping PID $($_.Id)"
        Stop-Process -Id $_.Id -Force
    }
Start-Sleep -Milliseconds 500

# ---------- 2. Rebuild data/app.db so the zip ships a fresh DB ----------
Section "Step 2/6  Refresh data/app.db from the canonical Excel"
$DbPath  = Join-Path $ProjectRoot "data\app.db"
$XlsPath = Join-Path $ProjectRoot "data\us_missile_range_data.xlsx"
if (-not (Test-Path $XlsPath)) {
    Write-Error "data/us_missile_range_data.xlsx not found. The dist needs a seed Excel."
}
# Remove old DB so db:import starts from a clean slate.
Remove-Item $DbPath -Force -ErrorAction SilentlyContinue
Remove-Item ($DbPath + "-shm") -Force -ErrorAction SilentlyContinue
Remove-Item ($DbPath + "-wal") -Force -ErrorAction SilentlyContinue
& npm run db:import
if ($LASTEXITCODE -ne 0) { Write-Error "npm run db:import failed" }

# ---------- 3. next build (produces .next/standalone/) ----------
Section "Step 3/6  next build"
# Wipe stale `next dev` artifacts before `next build` (the malformed
# .next/dev/types/routes.d.ts can break the production TypeScript
# check). IMPORTANT: when .next is a junction to %LOCALAPPDATA%
# (scripts/setup-dev-cache.ps1), the junction TARGET also hosts the
# node_modules junction's target as a SIBLING folder. Iterating the
# junction's children and deleting them all would wipe node_modules
# too. So we only delete the specific subfolders next dev/build creates,
# leaving node_modules and any unrelated siblings alone.
$NextCache = Join-Path $ProjectRoot ".next"
if (Test-Path $NextCache) {
    $nextItem = Get-Item $NextCache -Force
    $isJunction = $nextItem.Attributes -band [IO.FileAttributes]::ReparsePoint
    if ($isJunction) {
        Write-Host "  Clearing dev/build subfolders inside .next junction (preserving link + sibling node_modules)"
        foreach ($sub in @("dev", "build", "server", "static", "standalone", "cache", "trace", "diagnostics", "logs", "types")) {
            $p = Join-Path $NextCache $sub
            if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue }
        }
        # Also wipe stray loose files (build-manifest.json etc.) so the
        # next build sees a clean state. node_modules is a folder, so
        # this -File filter never matches it.
        Get-ChildItem -Path $NextCache -File -Force -ErrorAction SilentlyContinue |
            ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }
    } else {
        Write-Host "  Clearing $NextCache ..."
        Remove-Item $NextCache -Recurse -Force
    }
}
& npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "next build failed" }
$StandaloneSrc = Join-Path $ProjectRoot ".next\standalone"
if (-not (Test-Path (Join-Path $StandaloneSrc "server.js"))) {
    Write-Error "Standalone output is missing .next/standalone/server.js. Check next.config.ts has output: 'standalone'."
}

# ---------- 4. Acquire portable Node.js ----------
Section "Step 4/6  Acquire portable Node.js ($NodeVersion $NodeArch)"
$NodeFolderName = "node-$NodeVersion-$NodeArch"
$NodeZip        = Join-Path $VendorDir "$NodeFolderName.zip"
$NodeExtracted  = Join-Path $VendorDir $NodeFolderName

if (-not (Test-Path $VendorDir)) { New-Item -ItemType Directory -Path $VendorDir | Out-Null }

# Verify the cached portable Node (if present) actually matches the
# version we want to ship. Otherwise wipe it and re-acquire — this
# prevents a stale cache from leaking an old Node into the dist.
if (Test-Path (Join-Path $NodePortDir "node.exe")) {
    $cachedVer = (& (Join-Path $NodePortDir "node.exe") --version).Trim()
    if ($cachedVer -ne $NodeVersion) {
        Write-Host "  vendor/node-portable/ has $cachedVer, want $NodeVersion — refreshing"
        Remove-Item $NodePortDir -Recurse -Force
    }
}

if (-not (Test-Path (Join-Path $NodePortDir "node.exe"))) {
    if (-not (Test-Path (Join-Path $NodeExtracted "node.exe"))) {
        if (-not (Test-Path $NodeZip)) {
            $url = "https://nodejs.org/dist/$NodeVersion/$NodeFolderName.zip"
            Write-Host "  Downloading $url ..."
            try {
                Invoke-WebRequest -Uri $url -OutFile $NodeZip -UseBasicParsing
            } catch {
                Write-Host ""
                Write-Host "  Could not download Node.js portable automatically." -ForegroundColor Yellow
                Write-Host "  Manual fix: download $url" -ForegroundColor Yellow
                Write-Host "  and save it to: $NodeZip" -ForegroundColor Yellow
                Write-Host "  Then re-run this script." -ForegroundColor Yellow
                Write-Error "Node.js portable acquisition failed."
            }
        }
        Write-Host "  Extracting $NodeZip ..."
        Expand-Archive -LiteralPath $NodeZip -DestinationPath $VendorDir -Force
    }
    # Flatten: copy the extracted contents into vendor/node-portable/.
    if (-not (Test-Path $NodePortDir)) { New-Item -ItemType Directory -Path $NodePortDir | Out-Null }
    Copy-Item -Path (Join-Path $NodeExtracted "*") -Destination $NodePortDir -Recurse -Force
}
Write-Host "  Using node at: $(Join-Path $NodePortDir 'node.exe')"

# ---------- 5. Assemble dist/LapamRangesApp/ ----------
Section "Step 5/6  Assemble dist/$AppFolder/"
if (Test-Path $AppOut) {
    Write-Host "  Cleaning $AppOut ..."
    Remove-Item $AppOut -Recurse -Force
}
New-Item -ItemType Directory -Path $AppOut | Out-Null

# 5a. Standalone server bundle (server.js + traced node_modules + .next/server)
Copy-Item -Path (Join-Path $StandaloneSrc "*") -Destination $AppOut -Recurse -Force
Write-Host "  Copied .next/standalone/* → dist/$AppFolder/"

# 5b. Static assets — Next.js doesn't auto-copy these in standalone mode.
$StaticDest = Join-Path $AppOut ".next\static"
if (-not (Test-Path $StaticDest)) { New-Item -ItemType Directory -Path $StaticDest -Force | Out-Null }
Copy-Item -Path (Join-Path $ProjectRoot ".next\static\*") -Destination $StaticDest -Recurse -Force
Write-Host "  Copied .next/static/* → dist/$AppFolder/.next/static/"

# 5c. public/
$PublicSrc  = Join-Path $ProjectRoot "public"
$PublicDest = Join-Path $AppOut "public"
if (Test-Path $PublicSrc) {
    Copy-Item -Path $PublicSrc -Destination $PublicDest -Recurse -Force
    Write-Host "  Copied public/ → dist/$AppFolder/public/"
}

# 5d. data/ — the freshly imported app.db, the canonical Excel so future
#     re-imports are possible from inside the dist, and the import template
#     so the in-app "הורד תבנית ייבוא" button (/api/import-template reads
#     data/import-template.xlsx) returns the file instead of 404.
$DataDest = Join-Path $AppOut "data"
New-Item -ItemType Directory -Path $DataDest -Force | Out-Null
Copy-Item -Path $DbPath  -Destination $DataDest -Force
Copy-Item -Path $XlsPath -Destination $DataDest -Force
$TemplatePath = Join-Path $ProjectRoot "data\import-template.xlsx"
if (Test-Path $TemplatePath) {
    Copy-Item -Path $TemplatePath -Destination $DataDest -Force
    Write-Host "  Copied data/app.db + us_missile_range_data.xlsx + import-template.xlsx → dist/$AppFolder/data/"
} else {
    Write-Warning "  data/import-template.xlsx missing — in-app template download will 404. Run 'npm run build:template' before retrying."
    Write-Host "  Copied data/app.db + us_missile_range_data.xlsx → dist/$AppFolder/data/"
}

# 5e. Empty bucket directories that the running app expects to exist.
foreach ($d in @("files\documents","files\images","files\exports","backups","imports","imports\previews")) {
    $full = Join-Path $AppOut $d
    New-Item -ItemType Directory -Path $full -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $full ".gitkeep") -Value "" -NoNewline
}
Write-Host "  Created empty buckets (files/, backups/, imports/)"

# 5f. Portable Node.js
$NodeOut = Join-Path $AppOut "node-portable"
Copy-Item -Path $NodePortDir -Destination $NodeOut -Recurse -Force
Write-Host "  Copied portable Node.js → dist/$AppFolder/node-portable/"

# 5g. Production start.bat (overwrites the dev one that came in from the
#     standalone copy, if any).
$ProdStartBat = @"
@echo off
REM ============================================================
REM  מפת מטווחי ניסוי טילים — production launcher.
REM
REM  Extracts and runs the local app on http://127.0.0.1:3000.
REM  Uses the bundled portable Node.js — no system Node install
REM  is required on the employee's machine.
REM ============================================================
setlocal
cd /d "%~dp0"

REM 1. Use bundled portable Node if present.
if exist "node-portable\node.exe" (
    set "PATH=%~dp0node-portable;%PATH%"
) else (
    echo node-portable\node.exe not found.
    echo The distribution looks incomplete — contact the developer.
    pause
    exit /b 1
)

REM 2. Sanity-check the database (was packaged in the zip).
if not exist "data\app.db" (
    echo data\app.db missing — the distribution looks incomplete.
    pause
    exit /b 1
)

echo.
echo Starting the app at http://127.0.0.1:3000
echo Close this window to stop the app.
echo.

REM 3. Open the browser after a short delay so the server is ready.
start "" cmd /c "timeout /t 3 >nul && start http://127.0.0.1:3000/map"

REM 4. Run the standalone server. PORT/HOSTNAME drive Next.js's binding.
set HOSTNAME=127.0.0.1
set PORT=3000
node server.js

endlocal
"@
Set-Content -LiteralPath (Join-Path $AppOut "start.bat") -Value $ProdStartBat -Encoding ASCII
Write-Host "  Wrote production start.bat"

# 5h. Hebrew quick-start README.
$ProdReadme = @"
מפת מטווחי ניסוי טילים — הוראות הפעלה

1. חלץ את כל הקבצים בקובץ ה-ZIP לתיקייה כלשהי על המחשב.
2. לחץ פעמיים על start.bat שבתיקייה.
3. הדפדפן ייפתח אוטומטית בכתובת http://127.0.0.1:3000
4. לעצירת המערכת — סגור את חלון המסוף (הלבן/השחור) שנפתח עם הפעלת start.bat.

הערות:
- אין צורך להתקין Node.js — חבילת ההפעלה כוללת אותו.
- כל הנתונים נשמרים מקומית בקובץ data/app.db.
- גיבויים אוטומטיים נשמרים בתיקייה backups/.

תמיכה: Oren Sanovsky  ·  sanovsky@gmail.com  ·  +972-54-4242529
"@
Set-Content -LiteralPath (Join-Path $AppOut "README.txt") -Value $ProdReadme -Encoding UTF8
Write-Host "  Wrote Hebrew README.txt"

# ---------- 6. Optional: zip ----------
Section "Step 6/6  Compress dist/$AppFolder.zip"
if ($MakeZip) {
    $ZipOut = Join-Path $DistRoot "$AppFolder.zip"
    Remove-Item $ZipOut -Force -ErrorAction SilentlyContinue
    Compress-Archive -Path $AppOut -DestinationPath $ZipOut
    $sizeMb = [math]::Round((Get-Item $ZipOut).Length / 1MB, 1)
    Write-Host "  Wrote $ZipOut ($sizeMb MB)"
} else {
    Write-Host "  Skipped (MakeZip = false)"
}

Section "Done"
Write-Host "  Distribution folder: $AppOut"
if ($MakeZip) { Write-Host "  Distribution zip:    $(Join-Path $DistRoot ($AppFolder + '.zip'))" }
Write-Host ""
Write-Host "  To test locally before shipping:"
Write-Host "    cd `"$AppOut`""
Write-Host "    .\start.bat"
