import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { OPPORTUNITY_STAGES, type OpportunityStage } from "@/lib/types";

/**
 * GET /api/opportunities[?stage=&country=&owner=&search=]
 * Visibility-aware list. Rows whose Site is hidden (per-site or per-country)
 * are excluded by the data-store query.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const stage = sp.get("stage");
  const filters = {
    stage: stage && (OPPORTUNITY_STAGES as readonly string[]).includes(stage)
      ? (stage as OpportunityStage)
      : undefined,
    country: sp.get("country") || undefined,
    owner: sp.get("owner") || undefined,
    search: sp.get("search") || undefined,
  };
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ opportunities: store.listOpportunities(filters) });
}

/**
 * POST /api/opportunities
 * Body: { name, site_id, stage, probability?, amount?, close_date?, owner?,
 *         next_step?, description?, budget_confirmed?, discovery_completed?,
 *         roi_analysis_completed?, loss_reason?, created_by? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const store = getDataStore();
    await store.ensureLoaded();
    const opportunity = store.createOpportunity({
      name: body.name,
      site_id: body.site_id,
      stage: body.stage,
      probability: body.probability,
      amount: body.amount,
      close_date: body.close_date,
      owner: body.owner,
      next_step: body.next_step,
      description: body.description,
      budget_confirmed: body.budget_confirmed,
      discovery_completed: body.discovery_completed,
      roi_analysis_completed: body.roi_analysis_completed,
      loss_reason: body.loss_reason,
      created_by: body.created_by,
    });
    return NextResponse.json({ opportunity }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create opportunity";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
