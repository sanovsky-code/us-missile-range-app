/**
 * POST /api/import/scan
 *
 * Body:
 *   {
 *     parsed: ParseResult,
 *     allowIdentityFields?: boolean,
 *     allowCreateSites?: boolean     // wizard sends true; CLI defaults to false
 *   }
 *
 * Returns the per-site change tree the wizard's middle step renders. Only
 * Create/Update entities appear — NoChange and pure-validation-error rows
 * are filtered out, except that validation errors are still surfaced under
 * `issues` for the wizard to display.
 */
import { NextRequest, NextResponse } from "next/server";
import { scanForChanges, ParseResult } from "@/lib/excel-import";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { parsed: ParseResult; allowIdentityFields?: boolean; allowCreateSites?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!body.parsed || !body.parsed.sheets) {
    return NextResponse.json({ error: "Body must include parsed.sheets from /api/import/parse." }, { status: 400 });
  }
  try {
    const result = scanForChanges(body.parsed, {
      allowIdentityFields: body.allowIdentityFields,
      allowCreateSites: body.allowCreateSites ?? true,
    });
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: `Scan failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
