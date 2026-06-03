import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/sites/:siteId/contacts → list user-managed contacts for a site. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ contacts: store.listSiteContacts(siteId) });
}

/**
 * POST /api/sites/:siteId/contacts
 * Body: { full_name, role_title?, organization?, phone?, email?, notes? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  try {
    const body = (await request.json()) as {
      full_name?: string;
      role_title?: string;
      organization?: string;
      phone?: string;
      email?: string;
      notes?: string;
    };
    const store = getDataStore();
    await store.ensureLoaded();
    const contact = store.createSiteContact({
      site_id: siteId,
      full_name: body.full_name ?? "",
      role_title: body.role_title,
      organization: body.organization,
      phone: body.phone,
      email: body.email,
      notes: body.notes,
    });
    return NextResponse.json({ contact }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create contact";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
