/**
 * POST /api/import/parse
 *
 * Accepts a multipart upload containing an .xlsx file under the field
 * "file" and returns the parsed sheet contents the wizard needs in order
 * to render its record-selection table. Does NOT touch SQLite.
 *
 * Response shape: { result: ParseResult }
 */
import { NextRequest, NextResponse } from "next/server";
import { parseExcelForSelection } from "@/lib/excel-import";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a 'file' field." }, { status: 400 });
  }
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "Only .xlsx files are supported." }, { status: 400 });
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseExcelForSelection(buffer, file.name);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to parse Excel file: ${(err as Error).message}` },
      { status: 400 },
    );
  }
}
