# Move the .next/ build cache OUTSIDE OneDrive by replacing it with a
# directory junction pointing to %LOCALAPPDATA%\next-cache\<project>.
#
# WHY: On Windows + OneDrive, Turbopack's jest-worker subprocesses crash
# with 0xc0000142 when OneDrive holds transient sync locks on .next/dev/
# files mid-write. Two consecutive spawn failures put Turbopack into a
# wedged state ("Jest worker encountered 2 child process exceptions"),
# and every route stays broken until the cache is wiped. %LOCALAPPDATA%
# is never synced by OneDrive, so the file watcher and OneDrive stop
# fighting.
#
# WHY A JUNCTION (and not next.config distDir): Next.js requires distDir
# to be a path relative to the project root, so we can't point it at an
# absolute path like C:\Users\...\AppData\. A directory junction (mklink
# /J, no admin or developer-mode needed) makes the OS treat ".next" as
# a normal folder on disk while it actually lives under %LOCALAPPDATA%.
#
# WHY ALSO node_modules JUNCTION: Turbopack runs PostCSS / Tailwind in a
# child process from .next/dev/build/postcss.js. Node resolves modules
# from the file's real path on disk — which after the .next junction
# lives under %LOCALAPPDATA% — and walks up looking for node_modules.
# Without a matching node_modules entry in the cache target, those tools
# can't resolve their dependencies. The inner junction back to the
# project's node_modules fixes that without copying anything.
#
# ONE-TIME PER MACHINE / PER PROJECT CHECKOUT. Re-running is safe — the
# script re-creates the junctions. Other machines (or employees running
# the standalone build) do NOT need this script; it only matters for
# `next dev`.
#
# IMPORTANT: stop your dev server BEFORE running this script. The script
# refuses to delete .next/ while node processes are alive, because
# killing them from inside npm would also kill this script's host shell.
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

Write-Host "Project root  : $ProjectRoot"
Write-Host "Junction targ : $Target"
Write-Host ""

# 1. Bail if a dev server is running. Killing node here would also kill
#    the npm process that invoked this script.
$running = Get-Process -Name node -ErrorAction SilentlyContinue
if ($running) {
    Write-Error @"
A node.js process is running ($($running.Count) instance(s)). Stop your
dev server first, then re-run this script:

  Get-Process -Name node | Stop-Process -Force

Then:

  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-dev-cache.ps1
"@
    exit 1
}

# 2. Ensure project's node_modules exists. Without it the inner junction
#    would point at nothing.
if (-not (Test-Path $ProjectNm)) {
    Write-Error "node_modules/ not found in project root. Run 'npm install' first."
    exit 1
}

# 3. Ensure the cache target folder exists.
if (-not (Test-Path $CacheRoot)) {
    New-Item -ItemType Directory -Path $CacheRoot | Out-Null
}
if (-not (Test-Path $Target)) {
    New-Item -ItemType Directory -Path $Target | Out-Null
    Write-Host "[+] Created cache target: $Target"
}

# 4. Wipe the existing .next/ (whether real folder or stale junction).
if (Test-Path $NextDir) {
    $item = Get-Item $NextDir -Force
    $isReparse = $item.Attributes -band [IO.FileAttributes]::ReparsePoint
    if ($isReparse) {
        # rmdir (without /S) deletes a junction's link without touching the
        # target. Note: PowerShell's Remove-Item on a junction can be
        # finicky, so we shell out to cmd.
        Write-Host "[~] Removing existing .next junction"
        cmd /c "rmdir `"$NextDir`"" | Out-Null
    } else {
        Write-Host "[~] Removing existing .next folder"
        Remove-Item -Recurse -Force $NextDir
    }
}

# 5. Create .next -> <target> junction.
Write-Host "[+] Creating junction .next -> $Target"
cmd /c "mklink /J `"$NextDir`" `"$Target`"" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "mklink /J failed (exit $LASTEXITCODE)."
    exit 1
}

# 6. Create <target>/node_modules -> <project>/node_modules junction.
if (Test-Path $TargetNm) {
    $item = Get-Item $TargetNm -Force
    $isReparse = $item.Attributes -band [IO.FileAttributes]::ReparsePoint
    if ($isReparse) {
        cmd /c "rmdir `"$TargetNm`"" | Out-Null
    } else {
        Remove-Item -Recurse -Force $TargetNm
    }
}
Write-Host "[+] Creating junction $Target\node_modules -> $ProjectNm"
cmd /c "mklink /J `"$TargetNm`" `"$ProjectNm`"" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "mklink /J for node_modules failed (exit $LASTEXITCODE)."
    exit 1
}

# 7. Verify .next round-trips by writing a marker via the link and
#    reading it back through the target.
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

Write-Host ""
Write-Host "[OK] .next and .next\node_modules are now junctions to $Target."
Write-Host "     OneDrive will no longer see Turbopack's churn."
Write-Host "     Run 'npm run dev' as usual."
