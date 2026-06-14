import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/range-activities/:id/history — append-only field-change feed. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ history: store.listRangeActivityHistory(id) });
}
