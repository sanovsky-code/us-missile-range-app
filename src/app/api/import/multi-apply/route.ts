/**
 * POST /api/import/multi-apply
 *
 * Body: MultiSelectiveImportOptions (without `mode` — forced to "apply").
 * Backs up the DB, applies inside a transaction, returns the final report.
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
    const report = await runMultiTypeSelectiveImport({ ...body, mode: "apply" });
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json(
      { error: `Multi-apply failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
