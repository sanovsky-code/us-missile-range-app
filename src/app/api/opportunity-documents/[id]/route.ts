import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** DELETE /api/opportunity-documents/:id — removes the URL link record. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const docId = Number(id);
  if (!Number.isFinite(docId)) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }
  const store = getDataStore();
  await store.ensureLoaded();
  const ok = store.deleteOpportunityDocument(docId);
  if (!ok) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
