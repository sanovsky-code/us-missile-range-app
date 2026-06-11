import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import type { OpportunityDocType } from "@/lib/types";

/** GET /api/opportunities/:id/documents */
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
  return NextResponse.json({ documents: store.listOpportunityDocuments(oppId) });
}

/**
 * POST /api/opportunities/:id/documents
 * Body: { title, url, doc_type?, notes?, created_by? }
 * We store URL links only — no file upload.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const oppId = Number(id);
  if (!Number.isFinite(oppId)) {
    return NextResponse.json({ error: "Invalid opportunity id" }, { status: 400 });
  }
  try {
    const body = (await request.json()) as {
      title?: string;
      url?: string;
      doc_type?: OpportunityDocType;
      notes?: string;
      created_by?: string;
    };
    const store = getDataStore();
    await store.ensureLoaded();
    const document = store.createOpportunityDocument({
      opportunity_id: oppId,
      title: body.title ?? "",
      url: body.url ?? "",
      doc_type: body.doc_type,
      notes: body.notes,
      created_by: body.created_by,
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create document";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
