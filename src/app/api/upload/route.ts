import { NextRequest, NextResponse } from "next/server";
import { parseAndValidateExcel } from "@/lib/excel-parser";
import { getDataStore } from "@/lib/data-store";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "Only .xlsx files are supported" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await parseAndValidateExcel(buffer);

    if (result.success) {
      const store = getDataStore();
      store.loadFromImport(
        result.sites,
        result.radars,
        result.activities,
        result.sources,
        result.contacts
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
    return NextResponse.json(
      { error: "Failed to process Excel file: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}
