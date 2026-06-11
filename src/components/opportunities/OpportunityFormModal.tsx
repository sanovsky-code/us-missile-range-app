"use client";

/**
 * Salesforce-style create/edit dialog for Opportunities.
 *
 * Flow: pick Country (replaces "Account") → the Site lookup is filtered to
 * sites in that country → pick a Stage → Probability auto-fills from the
 * Salesforce-style stage map (operator can override).
 *
 * mode="create" → POST /api/opportunities
 * mode="edit"   → PATCH /api/opportunities/:id
 *
 * Documents and activities are managed on the detail page, not here.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, X, AlertCircle, DollarSign, Calendar, User } from "lucide-react";
import type { Opportunity, OpportunityStage } from "@/lib/types";
import { OPPORTUNITY_STAGES, STAGE_HEBREW, STAGE_PROBABILITY } from "@/lib/types";
import LookupField from "@/components/ui/LookupField";

interface SiteOption { site_id: string; site_name: string; country?: string; }

interface Props {
  mode: "create" | "edit";
  initial?: Opportunity;
  onClose: () => void;
  onSaved: (saved: Opportunity) => void;
}

export default function OpportunityFormModal({ mode, initial, onClose, onSaved }: Props) {
  const [sites, setSites] = useState<SiteOption[] | null>(null);
  const [country, setCountry] = useState<string>(initial?.country ?? "");
  const [form, setForm] = useState<Partial<Opportunity>>(() => ({
    name: "",
    site_id: "",
    stage: "Initial Contact",
    probability: STAGE_PROBABILITY["Initial Contact"],
    amount: undefined,
    close_date: "",
    owner: "",
    next_step: "",
    description: "",
    budget_confirmed: false,
    discovery_completed: false,
    roi_analysis_completed: false,
    loss_reason: "",
    ...(initial ?? {}),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True once the operator manually edits Probability — after that, stage
   * changes will NOT overwrite their value. Mirrors Salesforce behavior. */
  const [probabilityOverridden, setProbabilityOverridden] = useState(false);

  // Side-load sites once.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/sites");
        const j = await r.json();
        const list = (j.sites ?? []).map((s: { site_id: string; site_name: string; country?: string }) => ({
          site_id: s.site_id, site_name: s.site_name, country: s.country,
        })) as SiteOption[];
        setSites(list);
        // In edit mode, infer country from the linked site if not already
        // present on the opportunity.
        if (!country && initial?.site_id) {
          const match = list.find((s) => s.site_id === initial.site_id);
          if (match?.country) setCountry(match.country);
        }
      } catch { setSites([]); }
    })();
  }, [country, initial?.site_id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // List of countries derived from the sites payload.
  const countries = useMemo(() => {
    if (!sites) return [];
    const set = new Set<string>();
    for (const s of sites) if (s.country) set.add(s.country);
    return Array.from(set).sort();
  }, [sites]);

  // Sites filtered to the picked country. When no country is picked we hide
  // the entire site lookup to nudge the operator through the Country-first
  // Salesforce flow.
  const sitesInCountry = useMemo(() => {
    if (!sites || !country) return null;
    return sites.filter((s) => s.country === country);
  }, [sites, country]);

  const set = <K extends keyof Opportunity>(k: K, v: Opportunity[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const onStageChange = (stage: OpportunityStage) => {
    setForm((prev) => ({
      ...prev,
      stage,
      probability: probabilityOverridden ? prev.probability : STAGE_PROBABILITY[stage],
    }));
  };

  const submit = async () => {
    if (!form.name?.trim()) { setError("שם הזדמנות הוא חובה"); return; }
    if (!form.site_id) { setError("יש לבחור אתר"); return; }
    if (!form.stage) { setError("יש לבחור Stage"); return; }
    setBusy(true); setError(null);
    try {
      const url = mode === "create" ? "/api/opportunities" : `/api/opportunities/${initial!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const payload: Record<string, unknown> = {
        name: form.name?.trim(),
        site_id: form.site_id,
        stage: form.stage,
        probability: form.probability,
        amount: form.amount,
        close_date: form.close_date || null,
        owner: form.owner?.trim() || null,
        next_step: form.next_step?.trim() || null,
        description: form.description?.trim() || null,
        budget_confirmed: !!form.budget_confirmed,
        discovery_completed: !!form.discovery_completed,
        roi_analysis_completed: !!form.roi_analysis_completed,
        loss_reason: form.loss_reason?.trim() || null,
      };
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      onSaved(j.opportunity as Opportunity);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gradient-to-l from-blue-50 to-white">
          <h2 className="text-lg font-bold text-gray-900">
            {mode === "create" ? "הזדמנות חדשה" : "עריכת הזדמנות"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* --- Identity --- */}
          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">פרטי הזדמנות</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  שם ההזדמנות <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name ?? ""}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="לדוגמה: White Sands — מערכת ראדר X"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded"
                  dir="auto"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  מדינה (Account) <span className="text-red-500">*</span>
                </label>
                <select
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    // Reset the site selection so the operator must pick
                    // again from the now-narrowed list. Avoids stale
                    // "site doesn't belong to this country" bugs.
                    set("site_id", "");
                  }}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
                  dir="auto"
                >
                  <option value="">— בחר מדינה —</option>
                  {countries.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  אתר (Site) <span className="text-red-500">*</span>
                </label>
                {country ? (
                  <LookupField<SiteOption>
                    value={form.site_id ?? null}
                    onChange={(v) => set("site_id", v ?? "")}
                    options={sitesInCountry}
                    getKey={(o) => o.site_id}
                    filter={(o, q) => {
                      const s = q.toLowerCase();
                      return (
                        o.site_name.toLowerCase().includes(s) ||
                        o.site_id.toLowerCase().includes(s)
                      );
                    }}
                    renderRow={(o) => (
                      <div className="flex justify-between gap-2">
                        <span dir="auto">{o.site_name}</span>
                        <span className="text-xs text-gray-400" dir="ltr">{o.site_id}</span>
                      </div>
                    )}
                    renderChip={(o) => (
                      <span dir="auto">{o.site_name}</span>
                    )}
                    placeholder="חפש אתר..."
                  />
                ) : (
                  <div className="px-3 py-1.5 text-sm border border-gray-200 rounded bg-gray-50 text-gray-400">
                    יש לבחור מדינה תחילה
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* --- Stage / Probability / Amount --- */}
          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">סטטוס ומכירה</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Stage <span className="text-red-500">*</span></label>
                <select
                  value={form.stage ?? "Initial Contact"}
                  onChange={(e) => onStageChange(e.target.value as OpportunityStage)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
                >
                  {OPPORTUNITY_STAGES.map((s) => (
                    <option key={s} value={s}>{STAGE_HEBREW[s]} ({s})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Probability (%)</label>
                <input
                  type="number" min={0} max={100}
                  value={form.probability ?? 0}
                  onChange={(e) => {
                    setProbabilityOverridden(true);
                    set("probability", Number(e.target.value));
                  }}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> Amount (USD)
                </label>
                <input
                  type="number" min={0}
                  value={form.amount ?? ""}
                  onChange={(e) => set("amount", e.target.value === "" ? undefined : Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Close Date
                </label>
                <input
                  type="date"
                  value={form.close_date ?? ""}
                  onChange={(e) => set("close_date", e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <User className="w-3 h-3" /> Owner
                </label>
                <input
                  type="text"
                  value={form.owner ?? ""}
                  onChange={(e) => set("owner", e.target.value)}
                  placeholder="שם המכירן האחראי"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded"
                  dir="auto"
                />
              </div>
            </div>
          </section>

          {/* --- Next steps & description --- */}
          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">פרטים נוספים</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Next Step</label>
                <input
                  type="text"
                  value={form.next_step ?? ""}
                  onChange={(e) => set("next_step", e.target.value)}
                  placeholder="הצעד הבא — לדוגמה: לשלוח הצעה ב-15 לחודש"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded"
                  dir="auto"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">תיאור</label>
                <textarea
                  value={form.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                  rows={3}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded"
                  dir="auto"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!form.budget_confirmed}
                    onChange={(e) => set("budget_confirmed", e.target.checked)}
                  />
                  תקציב מאושר
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!form.discovery_completed}
                    onChange={(e) => set("discovery_completed", e.target.checked)}
                  />
                  Discovery הושלם
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!form.roi_analysis_completed}
                    onChange={(e) => set("roi_analysis_completed", e.target.checked)}
                  />
                  ניתוח ROI הושלם
                </label>
              </div>

              {form.stage === "Lost" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Loss Reason</label>
                  <input
                    type="text"
                    value={form.loss_reason ?? ""}
                    onChange={(e) => set("loss_reason", e.target.value)}
                    placeholder="סיבה לאיבוד ההזדמנות"
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded"
                    dir="auto"
                  />
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-sm border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50"
          >
            ביטול
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "create" ? "צור הזדמנות" : "שמור שינויים"}
          </button>
        </div>
      </div>
    </div>
  );
}
