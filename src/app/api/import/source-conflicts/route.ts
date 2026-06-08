/**
 * POST /api/import/source-conflicts
 *
 * Body:
 *   {
 *     parsed: ParseResult,
 *     importType: "sites" | "radars" | "site_range_activities" | "contacts",
 *     selectedKeys: string[]
 *   }
 *
 * Returns the list of source_ids that the selected entity rows reference,
 * already classified into willCreate / willReuse / conflicts. The wizard
 * uses this to render Step 4 (the source-conflict UI).
 */
import { NextRequest, NextResponse } from "next/server";
import { detectSourceConflicts, ImportType, ParseResult } from "@/lib/excel-import";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { parsed: ParseResult; importType: ImportType; selectedKeys: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!body.parsed || !body.importType || !Array.isArray(body.selectedKeys)) {
    return NextResponse.json(
      { error: "Body must include parsed, importType, and selectedKeys[]." },
      { status: 400 },
    );
  }
  try {
    const result = detectSourceConflicts(body.parsed, body.importType, body.selectedKeys);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to detect source conflicts: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
