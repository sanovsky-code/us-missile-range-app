/**
 * Controlled Excel update/import CLI.
 *
 * Reads an .xlsx file and either previews the diff against SQLite or applies
 * it inside a transaction (with a fresh data/app.db backup taken first).
 *
 * Usage:
 *   npm run import:excel -- --file "./imports/update.xlsx" --mode preview
 *   npm run import:excel -- --file "./imports/update.xlsx" --mode apply
 *
 * Optional flags:
 *   --by "<username>"             stamped into audit_log.changed_by
 *   --allow-identity-fields       also write site_name / latitude / longitude / country / state
 *
 * Preview mode writes a JSON file to imports/previews/preview_<batch_id>.json
 * and never touches SQLite data. Apply mode writes audit_log + import_batches
 * + import_validation_errors rows describing what changed.
 */
import path from "path";
import fs from "fs";
import { runImport, writePreviewFile, ImportReport, RowDecision } from "../src/lib/excel-import";


interface CliArgs {
  file: string;
  mode: "preview" | "apply";
  by?: string;
  allowIdentityFields: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let file = "";
  let mode: "preview" | "apply" = "preview";
  let by: string | undefined;
  let allowIdentityFields = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") { file = argv[++i] ?? ""; continue; }
    if (a === "--mode") {
      const m = argv[++i] ?? "";
      if (m !== "preview" && m !== "apply") {
        throw new Error(`--mode must be "preview" or "apply", got "${m}"`);
      }
      mode = m;
      continue;
    }
    if (a === "--by") { by = argv[++i]; continue; }
    if (a === "--allow-identity-fields") { allowIdentityFields = true; continue; }
    if (a === "--help" || a === "-h") { printHelpAndExit(0); }
  }
  if (!file) {
    console.error("ERROR: --file is required.\n");
    printHelpAndExit(1);
  }
  return { file, mode, by, allowIdentityFields };
}

function printHelpAndExit(code: number): never {
  console.log(`
Usage:
  npm run import:excel -- --file <path-to-xlsx> --mode <preview|apply> [--by <name>] [--allow-identity-fields]

Modes:
  preview   Compare Excel against SQLite, print a summary and write
            imports/previews/preview_<batch_id>.json. No data is changed.
  apply     Back up data/app.db, then apply the diff inside one SQLite
            transaction. Writes audit_log and import_batches rows.

Examples:
  npm run import:excel -- --file ./imports/update.xlsx --mode preview
  npm run import:excel -- --file ./imports/update.xlsx --mode apply --by "alice"
`);
  process.exit(code);
}


function colorize(text: string, color: "red" | "green" | "yellow" | "cyan" | "gray" | "bold"): string {
  if (!process.stdout.isTTY) return text;
  const codes: Record<string, string> = {
    red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
    cyan: "\x1b[36m", gray: "\x1b[90m", bold: "\x1b[1m",
  };
  return `${codes[color]}${text}\x1b[0m`;
}

function printReport(report: ImportReport): void {
  console.log("");
  console.log(colorize("=".repeat(72), "bold"));
  console.log(colorize(`Import batch ${report.batchId}`, "bold"));
  console.log(`  File:        ${report.fileName}`);
  console.log(`  Mode:        ${report.mode}`);
  console.log(`  Status:      ${colorize(
    report.status,
    report.status === "Completed" ? "green" : report.status === "Failed" ? "red" : "yellow",
  )}`);
  if (report.backupPath) console.log(`  Backup:      ${report.backupPath}`);
  if (report.errorMessage) console.log(colorize(`  Error:       ${report.errorMessage}`, "red"));
  console.log("");

  console.log(colorize("Per-sheet summary:", "bold"));
  console.log("  " + ["Sheet", "Create", "Update", "Skip", "NoChange", "Errors"].map((h) => h.padEnd(16)).join(""));
  for (const [sheet, s] of Object.entries(report.perSheet)) {
    console.log("  " + [
      sheet,
      String(s.create),
      String(s.update),
      String(s.skip),
      String(s.noChange),
      String(s.errors),
    ].map((c) => c.padEnd(16)).join(""));
  }
  console.log("");

  console.log(colorize("Totals:", "bold"));
  console.log(`  Total rows seen:  ${report.totals.totalRows}`);
  console.log(`  ${colorize("Created", "green")}:          ${report.totals.createdCount}`);
  console.log(`  ${colorize("Updated", "cyan")}:          ${report.totals.updatedCount}`);
  console.log(`  ${colorize("Skipped", "yellow")}:          ${report.totals.skippedCount}`);
  console.log(`  ${colorize("Errors", "red")}:           ${report.totals.errorCount}`);
  console.log("");

  // Detail: changed records with field-level diff (cap output)
  const changed = report.decisions.filter((d) => d.action === "Create" || d.action === "Update");
  if (changed.length > 0) {
    console.log(colorize(`Changes (${changed.length} record${changed.length === 1 ? "" : "s"}):`, "bold"));
    const MAX_RECORDS = 50;
    for (const d of changed.slice(0, MAX_RECORDS)) {
      printDecision(d);
    }
    if (changed.length > MAX_RECORDS) {
      console.log(colorize(`  … ${changed.length - MAX_RECORDS} more records — see preview JSON.`, "gray"));
    }
    console.log("");
  }

  const errs = report.issues.filter((i) => i.severity === "error");
  const warns = report.issues.filter((i) => i.severity === "warning");
  if (errs.length > 0) {
    console.log(colorize(`Validation errors (${errs.length}):`, "red"));
    for (const e of errs.slice(0, 30)) {
      console.log(`  [${e.sheet} row ${e.row}] ${e.field}: ${e.message}`);
    }
    if (errs.length > 30) console.log(colorize(`  … ${errs.length - 30} more.`, "gray"));
    console.log("");
  }
  if (warns.length > 0) {
    console.log(colorize(`Warnings (${warns.length}):`, "yellow"));
    for (const w of warns.slice(0, 20)) {
      console.log(`  [${w.sheet} row ${w.row}] ${w.field}: ${w.message}`);
    }
    if (warns.length > 20) console.log(colorize(`  … ${warns.length - 20} more.`, "gray"));
    console.log("");
  }

  console.log(colorize("=".repeat(72), "bold"));
}

function printDecision(d: RowDecision): void {
  const tag = d.action === "Create"
    ? colorize("[CREATE]", "green")
    : colorize("[UPDATE]", "cyan");
  console.log(`  ${tag} ${d.entityType} ${d.entityId}  (${d.sheetName} row ${d.rowNumber})`);
  for (const f of d.fields) {
    const action = f.isClear ? colorize("Clear", "yellow") : (d.action === "Create" ? colorize("Set", "green") : colorize("Update", "cyan"));
    const proto = f.isProtected ? colorize(" [protected]", "yellow") : "";
    const oldDisp = f.oldValue === null ? "(null)" : JSON.stringify(f.oldValue);
    const newDisp = f.newValue === null ? "(null)" : JSON.stringify(f.newValue);
    console.log(`     - ${action} ${f.field}${proto}:  ${oldDisp}  →  ${newDisp}`);
  }
}


async function main() {
  const args = parseArgs(process.argv.slice(2));

  const absFile = path.resolve(args.file);
  if (!fs.existsSync(absFile)) {
    console.error(colorize(`ERROR: file not found: ${absFile}`, "red"));
    process.exit(1);
  }

  console.log(colorize(`Running Excel import in "${args.mode}" mode on ${path.basename(absFile)}…`, "bold"));
  const report = await runImport({
    file: absFile,
    mode: args.mode,
    changedBy: args.by,
    allowIdentityFields: args.allowIdentityFields,
  });

  printReport(report);

  // Always write a copy of the report JSON
  const jsonPath = writePreviewFile(report);
  console.log(`Report written to: ${jsonPath}`);

  if (report.status === "Failed") process.exit(2);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(99);
});
