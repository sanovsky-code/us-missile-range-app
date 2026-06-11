import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import type { CrmContact } from "@/lib/types";

/** GET /api/crm-contacts/:id */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isFinite(contactId)) {
    return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  }
  const store = getDataStore();
  await store.ensureLoaded();
  const contact = store.getCrmContact(contactId);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  return NextResponse.json({ contact });
}

/**
 * PATCH /api/crm-contacts/:id
 * Body: Partial<CrmContact>. Empty strings are normalized to NULL.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isFinite(contactId)) {
    return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  }
  try {
    const body = (await request.json()) as Partial<CrmContact>;
    const store = getDataStore();
    await store.ensureLoaded();
    const updated = store.updateCrmContact(contactId, body);
    if (!updated) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    return NextResponse.json({ contact: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update contact";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/crm-contacts/:id — cascades the timeline rows. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isFinite(contactId)) {
    return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  }
  const store = getDataStore();
  await store.ensureLoaded();
  const ok = store.deleteCrmContact(contactId);
  if (!ok) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
