import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/imported-contacts/:id — fetch a single Excel-imported contact. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  const contact = store.getImportedContact(id);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  return NextResponse.json({ contact });
}

/**
 * PATCH /api/imported-contacts/:id — partial update. Every field change
 * lands in contact_field_history with kind="imported" so the operator
 * can audit changes from the site profile expand panel.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const store = getDataStore();
    await store.ensureLoaded();
    const updated = store.updateImportedContact(id, body);
    if (!updated) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    return NextResponse.json({ contact: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update contact";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
