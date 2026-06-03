import { NextRequest, NextResponse } from "next/server";
import { parseAndValidateExcel } from "@/lib/excel-parser";
import { getDataStore } from "@/lib/data-store";

/**
 * Accepts an .xlsx file, validates it, and loads its rows into SQLite.
 * A backup of the current data/app.db is created in /backups before the
 * destructive replace.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "לא סופק קובץ" }, { status: 400 });
    }

    if (!file.name.endsWith(".xlsx")) {
      return NextResponse.json({ error: "רק קבצי .xlsx נתמכים" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await parseAndValidateExcel(buffer);

    if (result.success) {
      const store = getDataStore();
      const backupPath = store.backup();
      if (backupPath) {
        console.log(`Backed up database to ${backupPath}`);
      }
      store.loadFromImport(
        result.sites,
        result.radars,
        result.activities,
        result.sources,
        result.contacts,
      );
    }

    return NextResponse.json({
      success: result.success,
      counts: {
        sites: result.sites.length,
        radars: result.radars.length,
        activities: result.activities.length,
        sources: result.sources.length,
        contacts: result.contacts.length,
      },
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה לא ידועה";
    return NextResponse.json(
      { error: "עיבוד קובץ האקסל נכשל: " + message },
      { status: 500 },
    );
  }
}
