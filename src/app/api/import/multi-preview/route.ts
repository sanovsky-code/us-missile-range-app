/**
 * POST /api/import/multi-preview
 *
 * Body: MultiSelectiveImportOptions (without `mode` — forced to "preview").
 * Returns a MultiSelectiveImportReport. No DB writes.
 */
import { NextRequest, NextResponse } from "next/server";
import { runMultiTypeSelectiveImport, MultiSelectiveImportOptions } from "@/lib/excel-import";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Omit<MultiSelectiveImportOptions, "mode">;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  try {
    const report = await runMultiTypeSelectiveImport({ ...body, mode: "preview" });
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json(
      { error: `Multi-preview failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
