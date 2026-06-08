/**
 * POST /api/import/multi-source-conflicts
 *
 * Body: { parsed, selectedKeys, allowIdentityFields?, allowCreateSites? }
 *
 * Returns SourceConflictResult — the union of source-id conflicts the user
 * must resolve before previewing/applying the multi-type selection.
 */
import { NextRequest, NextResponse } from "next/server";
import { detectMultiSourceConflicts, ParseResult } from "@/lib/excel-import";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { parsed: ParseResult; selectedKeys: string[]; allowIdentityFields?: boolean; allowCreateSites?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!body.parsed || !Array.isArray(body.selectedKeys)) {
    return NextResponse.json({ error: "Body must include parsed and selectedKeys[]." }, { status: 400 });
  }
  try {
    const result = detectMultiSourceConflicts(body.parsed, body.selectedKeys, {
      allowIdentityFields: body.allowIdentityFields,
      allowCreateSites: body.allowCreateSites ?? true,
    });
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to detect source conflicts: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
