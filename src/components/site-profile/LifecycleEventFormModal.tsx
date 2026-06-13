"use client";

/**
 * Create / edit dialog for a single Radar Lifecycle Event. Used by
 * RadarLifecycleSection (inline timeline in the radar's expanded row).
 *
 * mode="create" → POST /api/radars/:radarId/lifecycle
 * mode="edit"   → PATCH /api/lifecycle-events/:id
 *
 * created_by / updated_by pull from the global CurrentUserProvider — no
 * per-modal name input.
 */
import { useEffect, useState } from "react";
import { Loader2, X, AlertCircle } from "lucide-react";
import type { RadarLifecycleEvent } from "@/lib/types";
import { RADAR_LIFECYCLE_EVENT_TYPES } from "@/lib/types";
import { useCurrentUser } from "@/lib/current-user";

interface Props {
  mode: "create" | "edit";
  radarId: string;
  initial?: RadarLifecycleEvent;
  onClose: () => void;
  onSaved: (saved: RadarLifecycleEvent) => void;
}

const CURRENCIES = ["USD", "EUR", "SEK", "NOK", "DKK", "GBP", "ILS", "JPY", "Other"];

export default function LifecycleEventFormModal({ mode, radarId, initial, onClose, onSaved }: Props) {
  const { currentUser } = useCurrentUser();
  const [form, setForm] = useState<Partial<RadarLifecycleEvent>>(() => ({
    event_type: RADAR_LIFECYCLE_EVENT_TYPES[0],
    event_date: "",
    event_year: undefined,
    event_title: "",
    event_description: "",
    authority_or_owner: "",
    supplier_or_contractor: "",
    disclosed_value: "",
    currency: "",
    value_scope: "",
    evidence_status: "",
    source_ids: "",
    analyst_note: "",
    ...(initial ?? {}),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof RadarLifecycleEvent>(k: K, v: RadarLifecycleEvent[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.event_type) { setError("יש לבחור סוג אירוע"); return; }
    setBusy(true); setError(null);
    try {
      const attribution = currentUser?.trim() || undefined;
      const url = mode === "create" ? `/api/radars/${radarId}/lifecycle` : `/api/lifecycle-events/${initial!.event_id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      // Auto-derive event_year from event_date when the operator left it
      // blank — saves a manual entry and keeps the two columns in sync.
      let event_year = form.event_year;
      if (!event_year && form.event_date) {
        const y = Number(form.event_date.slice(0, 4));
        if (Number.isFinite(y)) event_year = y;
      }
      const payload: Record<string, unknown> = {
        event_type: form.event_type,
        event_date: form.event_date?.trim() || null,
        event_year: event_year ?? null,
        event_title: form.event_title?.trim() || null,
        event_description: form.event_description?.trim() || null,
        authority_or_owner: form.authority_or_owner?.trim() || null,
        supplier_or_contractor: form.supplier_or_contractor?.trim() || null,
        disclosed_value: form.disclosed_value?.trim() || null,
        currency: form.currency?.trim() || null,
        value_scope: form.value_scope?.trim() || null,
        evidence_status: form.evidence_status?.trim() || null,
        source_ids: form.source_ids?.trim() || null,
        analyst_note: form.analyst_note?.trim() || null,
        ...(mode === "create" ? { created_by: attribution } : { updated_by: attribution }),
      };
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      onSaved(j.event as RadarLifecycleEvent);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gradient-to-l from-blue-50 to-white">
          <h2 className="text-lg font-bold text-gray-900">
            {mode === "create" ? "אירוע מחזור חיים חדש" : "עריכת אירוע"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">סוג ותאריך</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">סוג אירוע <span className="text-red-500">*</span></label>
                <select value={form.event_type ?? ""} onChange={(e) => set("event_type", e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white">
                  {RADAR_LIFECYCLE_EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">תאריך אירוע</label>
                <input type="date" value={form.event_date ?? ""} onChange={(e) => set("event_date", e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="ltr" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">שנה (אם אין תאריך)</label>
                <input type="number" min={1900} max={2100} value={form.event_year ?? ""}
                  onChange={(e) => set("event_year", e.target.value === "" ? undefined : Number(e.target.value))}
                  placeholder="2024" className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="ltr" />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">תוכן</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">כותרת</label>
                <input type="text" value={form.event_title ?? ""} onChange={(e) => set("event_title", e.target.value)}
                  placeholder="לדוגמה: FMV award for radar with optical tracking"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="auto" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">תיאור</label>
                <textarea value={form.event_description ?? ""} onChange={(e) => set("event_description", e.target.value)}
                  rows={3} className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="auto" />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">בעלות / ספק</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Authority / Owner</label>
                <input type="text" value={form.authority_or_owner ?? ""} onChange={(e) => set("authority_or_owner", e.target.value)}
                  placeholder="FMV / U.S. Army / ..." className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="auto" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Supplier / Contractor</label>
                <input type="text" value={form.supplier_or_contractor ?? ""} onChange={(e) => set("supplier_or_contractor", e.target.value)}
                  placeholder="Weibel Scientific A/S / ..." className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="auto" />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">ערך כספי</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Disclosed value</label>
                <input type="text" value={form.disclosed_value ?? ""} onChange={(e) => set("disclosed_value", e.target.value)}
                  placeholder="195583823 / >100000000 / undisclosed"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="ltr" />
                <p className="text-[10px] text-gray-400 mt-0.5">טקסט חופשי — שמרו על קידומות (&gt;, ~, &lt;) כפי שהן.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                <select value={form.currency ?? ""} onChange={(e) => set("currency", e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white">
                  <option value="">—</option>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Value scope</label>
                <input type="text" value={form.value_scope ?? ""} onChange={(e) => set("value_scope", e.target.value)}
                  placeholder="Mirror-reported total contract value..."
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="auto" />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">ראיות והערות</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Evidence status</label>
                  <input type="text" value={form.evidence_status ?? ""} onChange={(e) => set("evidence_status", e.target.value)}
                    placeholder="Reported by procurement mirror / Confirmed by ..."
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="auto" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Source IDs</label>
                  <input type="text" value={form.source_ids ?? ""} onChange={(e) => set("source_ids", e.target.value)}
                    placeholder="SRC-0006, SRC-0014, SRC-0015"
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="ltr" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Analyst note</label>
                <textarea value={form.analyst_note ?? ""} onChange={(e) => set("analyst_note", e.target.value)}
                  rows={2} placeholder="פנימי — לא לתצוגה ציבורית"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="auto" />
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t bg-gray-50 flex-wrap">
          <span className="text-xs text-gray-500">
            השינוי יתועד תחת{" "}
            <span className="font-medium text-gray-700" dir="auto">{currentUser || "—"}</span>
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={busy}
              className="px-3 py-1.5 text-sm border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50">
              ביטול
            </button>
            <button onClick={submit} disabled={busy}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "create" ? "צור אירוע" : "שמור שינויים"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
