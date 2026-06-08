/**
 * POST /api/import/preview
 *
 * Body: SelectiveImportOptions (without `mode` — forced to "preview").
 * Runs the diff and returns a SelectiveImportReport. No DB writes.
 */
import { NextRequest, NextResponse } from "next/server";
import { runSelectiveImport, SelectiveImportOptions } from "@/lib/excel-import";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Omit<SelectiveImportOptions, "mode">;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  try {
    const report = await runSelectiveImport({ ...body, mode: "preview" });
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json(
      { error: `Preview failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
