import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/opportunities/:id */
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
  const opportunity = store.getOpportunity(oppId);
  if (!opportunity) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  return NextResponse.json({ opportunity });
}

/** PATCH /api/opportunities/:id */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const oppId = Number(id);
  if (!Number.isFinite(oppId)) {
    return NextResponse.json({ error: "Invalid opportunity id" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const store = getDataStore();
    await store.ensureLoaded();
    const updated = store.updateOpportunity(oppId, body);
    if (!updated) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    return NextResponse.json({ opportunity: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update opportunity";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/opportunities/:id — cascades activities + documents. */
export async function DELETE(
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
  const ok = store.deleteOpportunity(oppId);
  if (!ok) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
