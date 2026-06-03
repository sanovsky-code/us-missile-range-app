import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** PATCH /api/contacts/:id → partial update of a user-managed contact. */
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
    const body = (await request.json()) as Partial<{
      full_name: string;
      role_title: string;
      organization: string;
      phone: string;
      email: string;
      notes: string;
    }>;
    const store = getDataStore();
    await store.ensureLoaded();
    const updated = store.updateSiteContact(contactId, body);
    if (!updated) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    return NextResponse.json({ contact: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update contact";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/contacts/:id */
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
  const ok = store.deleteSiteContact(contactId);
  if (!ok) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
