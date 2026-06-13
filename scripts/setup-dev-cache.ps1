# Move Next.js's dev build cache AND the node_modules tree OUTSIDE
# OneDrive sync, by replacing them with directory junctions pointing at
# %LOCALAPPDATA%\next-cache\<project>\.
#
# WHY: On Windows + OneDrive + Next.js (Turbopack OR webpack), jest-worker
# subprocesses crash with 0xc0000142 ("DLL initialization failed") whenever
# OneDrive holds transient sync locks on files inside .next/ or
# node_modules/. After two failures the dev server wedges and surfaces
# "Jest worker encountered 2 child process exceptions, exceeding retry
# limit" on every route until the cache is wiped.
#
# WHY BOTH .next AND node_modules: the .next-only fix (commit b563eaa)
# stopped the dev-cache contention, but workers still hit lock contention
# reading from node_modules. The webpack switch (commit 919ea78) reduced
# but did not eliminate that — Next.js uses jest-worker for SWC + PostCSS
# transforms even under webpack. Moving node_modules out of OneDrive
# physically removes the offender.
#
# LAYOUT AFTER RUNNING:
#   <project>/.next         → junction → %LOCALAPPDATA%\next-cache\<project>\
#   <project>/node_modules  → junction → %LOCALAPPDATA%\next-cache\<project>\node_modules\
#
# Both real folders live under %LOCALAPPDATA% which OneDrive never syncs.
# git, IDEs, npm, and every build tool see the project's normal layout
# because junctions are transparent at the filesystem level.
#
# ONE-TIME PER MACHINE / PER CHECKOUT. Re-running is safe — the script
# preserves existing junctions if they already point at the right place
# and recreates them otherwise. Other employees running the standalone
# zip do NOT need this — it only matters for `next dev`.
#
# IMPORTANT: stop your dev server BEFORE running. The script refuses to
# delete .next/ or move node_modules while node is alive (because that
# would also kill its own npm host).
#
# Run with:   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-dev-cache.ps1

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ProjectName = Split-Path $ProjectRoot -Leaf
$NextDir     = Join-Path $ProjectRoot ".next"
$ProjectNm   = Join-Path $ProjectRoot "node_modules"
$CacheRoot   = Join-Path $env:LOCALAPPDATA "next-cache"
$Target      = Join-Path $CacheRoot $ProjectName
$TargetNm    = Join-Path $Target "node_modules"

Write-Host "Project root        : $ProjectRoot"
Write-Host "Cache target        : $Target"
Write-Host "node_modules target : $TargetNm"
Write-Host ""

# 1. Bail if a dev server is running.
$running = Get-Process -Name node -ErrorAction SilentlyContinue
if ($running) {
    Write-Error @"
A node.js process is running ($($running.Count) instance(s)). Stop your
dev server first, then re-run this script:

  Get-Process -Name node | Stop-Process -Force
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-dev-cache.ps1
"@
    exit 1
}

# 2. Ensure the cache target root exists.
if (-not (Test-Path $CacheRoot)) {
    New-Item -ItemType Directory -Path $CacheRoot | Out-Null
}
if (-not (Test-Path $Target)) {
    New-Item -ItemType Directory -Path $Target | Out-Null
    Write-Host "[+] Created cache target: $Target"
}


# -----------------------------------------------------------------------
# .next junction
# -----------------------------------------------------------------------

# 3a. Wipe the existing .next/ (junction or real folder).
if (Test-Path $NextDir) {
    $item = Get-Item $NextDir -Force
    $isReparse = $item.Attributes -band [IO.FileAttributes]::ReparsePoint
    if ($isReparse) {
        Write-Host "[~] Removing existing .next junction"
        cmd /c "rmdir `"$NextDir`"" | Out-Null
    } else {
        Write-Host "[~] Removing existing .next folder"
        Remove-Item -Recurse -Force $NextDir
    }
}

# 3b. Create .next -> <target> junction.
Write-Host "[+] Creating junction .next -> $Target"
cmd /c "mklink /J `"$NextDir`" `"$Target`"" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "mklink /J for .next failed (exit $LASTEXITCODE)."
    exit 1
}


# -----------------------------------------------------------------------
# node_modules junction
# -----------------------------------------------------------------------

# 4. If <target>/node_modules is a stale junction (from the old layout
#    that pointed BACK at project), strip it before we move the real
#    folder in.
if (Test-Path $TargetNm) {
    $item = Get-Item $TargetNm -Force
    $isReparse = $item.Attributes -band [IO.FileAttributes]::ReparsePoint
    if ($isReparse) {
        Write-Host "[~] Removing legacy node_modules junction inside target"
        cmd /c "rmdir `"$TargetNm`"" | Out-Null
    }
}

# 5. Decide what to do with project node_modules:
#      - No folder at all       → npm install will recreate it; just create
#                                 the AppData side as an empty folder for now.
#      - Real folder            → move it to AppData (fast on same volume).
#      - Already a junction     → assume it's already pointing at the right
#                                 place; verify and continue.
if (Test-Path $ProjectNm) {
    $item = Get-Item $ProjectNm -Force
    $isReparse = $item.Attributes -band [IO.FileAttributes]::ReparsePoint
    if ($isReparse) {
        Write-Host "[i] node_modules is already a junction. Verifying target..."
        if (-not (Test-Path $TargetNm)) {
            Write-Error "Junction exists but its target $TargetNm is missing. Recreate manually."
            exit 1
        }
        # Re-point: drop and reissue, in case it points at a different path.
        cmd /c "rmdir `"$ProjectNm`"" | Out-Null
    } else {
        # Real folder — move it. fast on the same NTFS volume.
        if (Test-Path $TargetNm) {
            Write-Error "Both <project>/node_modules and <target>/node_modules exist as real folders. Aborting to avoid clobbering. Inspect manually."
            exit 1
        }
        Write-Host "[~] Moving node_modules to $TargetNm (one-shot)"
        $sw = [Diagnostics.Stopwatch]::StartNew()
        Move-Item -Path $ProjectNm -Destination $TargetNm -Force
        $sw.Stop()
        Write-Host "    Took $($sw.Elapsed)."
    }
}

if (-not (Test-Path $TargetNm)) {
    # No node_modules anywhere yet — make the dir so the junction has a
    # valid target, then warn the user to run npm install.
    New-Item -ItemType Directory -Path $TargetNm | Out-Null
    Write-Warning "No node_modules found. Run 'npm install' after this script finishes."
}

Write-Host "[+] Creating junction node_modules -> $TargetNm"
cmd /c "mklink /J `"$ProjectNm`" `"$TargetNm`"" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "mklink /J for node_modules failed (exit $LASTEXITCODE)."
    exit 1
}


# -----------------------------------------------------------------------
# Verify
# -----------------------------------------------------------------------

# 6a. .next junction round-trips.
$marker     = ".cache-junction-check"
$viaLink    = Join-Path $NextDir $marker
$viaTarget  = Join-Path $Target $marker
$stamp      = (Get-Date).ToString("o")
Set-Content -Path $viaLink -Value $stamp -Encoding utf8
$readBack = Get-Content -Path $viaTarget -Raw
if ($readBack.Trim() -ne $stamp) {
    Write-Error ".next junction round-trip check failed."
    exit 1
}
Remove-Item -Force $viaLink

# 6b. node_modules junction can reach a package (only if there ARE
#     packages — skip when the user is about to run npm install).
$probe = Join-Path $ProjectNm "next\package.json"
if (Test-Path $probe) {
    Write-Host "[OK] node_modules junction resolves real packages"
} else {
    Write-Warning "node_modules is empty — run 'npm install' next."
}

Write-Host ""
Write-Host "[OK] Both .next and node_modules are now junctions to $Target."
Write-Host "     OneDrive will no longer touch them."
Write-Host "     Run 'npm run dev' as usual."
