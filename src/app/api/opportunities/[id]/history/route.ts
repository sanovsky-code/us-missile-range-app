import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/opportunities/:id/history — append-only field history feed. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const oppId = Number(id);
  if (!Number.isFinite(oppId)) {
    return NextResponse.json({ error: "Invalid opportunity id" }, { status: 400 });
  }
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ history: store.listOpportunityHistory(oppId) });
}
