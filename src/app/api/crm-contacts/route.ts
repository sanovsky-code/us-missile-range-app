import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import type { CrmContact } from "@/lib/types";

/** GET /api/crm-contacts → list view for the /contacts tab. */
export async function GET() {
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ contacts: store.listCrmContacts() });
}

/**
 * POST /api/crm-contacts
 * Body: Partial<CrmContact> with full_name required.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<CrmContact>;
    const store = getDataStore();
    await store.ensureLoaded();
    const contact = store.createCrmContact({
      ...body,
      full_name: body.full_name ?? "",
    });
    return NextResponse.json({ contact }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create contact";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
