"use client";

/**
 * Create / edit dialog for a Site System. Mirrors the OpportunityFormModal
 * shape: identity → category → operational details → free text. Used by
 * SystemsTable.
 *
 * mode="create" → POST /api/sites/:siteId/systems
 * mode="edit"   → PATCH /api/systems/:id
 *
 * created_by / updated_by come from CurrentUserProvider — no per-modal name
 * input.
 */
import { useEffect, useState } from "react";
import { Loader2, X, AlertCircle } from "lucide-react";
import type { System } from "@/lib/types";
import { SYSTEM_CATEGORIES } from "@/lib/types";
import { useCurrentUser } from "@/lib/current-user";

interface Props {
  mode: "create" | "edit";
  siteId: string;
  initial?: System;
  onClose: () => void;
  onSaved: (saved: System) => void;
}

const OPERATIONAL_STATUSES = ["Active", "Inactive", "Historical", "Unknown"];
const CONFIDENCE_LEVELS = ["High", "Medium", "Low"];
const RECORD_STATUSES = ["Draft", "Verified", "Needs Review", "Published", "Archived"];

export default function SystemFormModal({ mode, siteId, initial, onClose, onSaved }: Props) {
  const { currentUser } = useCurrentUser();
  const [form, setForm] = useState<Partial<System>>(() => ({
    system_name: "",
    system_category: SYSTEM_CATEGORIES[0],
    purpose: "",
    owner: "",
    operator: "",
    manufacturer: "",
    operational_status: "Active",
    public_description: "",
    citations: "",
    confidence_level: "Medium",
    last_verified_date: "",
    source_id: "",
    record_status: "Draft",
    ...(initial ?? {}),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof System>(k: K, v: System[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.system_name?.trim()) { setError("שם המערכת הוא חובה"); return; }
    if (!form.system_category) { setError("יש לבחור קטגוריה"); return; }
    setBusy(true); setError(null);
    try {
      const attribution = currentUser?.trim() || undefined;
      const url = mode === "create" ? `/api/sites/${siteId}/systems` : `/api/systems/${initial!.system_id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const payload: Record<string, unknown> = {
        system_name: form.system_name?.trim(),
        system_category: form.system_category,
        purpose: form.purpose?.trim() || null,
        owner: form.owner?.trim() || null,
        operator: form.operator?.trim() || null,
        manufacturer: form.manufacturer?.trim() || null,
        operational_status: form.operational_status,
        public_description: form.public_description?.trim() || null,
        citations: form.citations?.trim() || null,
        confidence_level: form.confidence_level,
        last_verified_date: form.last_verified_date || null,
        source_id: form.source_id?.trim() || null,
        record_status: form.record_status,
        ...(mode === "create" ? { created_by: attribution } : { updated_by: attribution }),
      };
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      onSaved(j.system as System);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gradient-to-l from-blue-50 to-white">
          <h2 className="text-lg font-bold text-gray-900">
            {mode === "create" ? "מערכת חדשה" : "עריכת מערכת"}
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

          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">זיהוי</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  שם המערכת <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.system_name ?? ""}
                  onChange={(e) => set("system_name", e.target.value)}
                  placeholder="לדוגמה: Optical tracking systems and kinetheodolites"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded"
                  dir="auto"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  קטגוריה <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.system_category ?? ""}
                  onChange={(e) => set("system_category", e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
                >
                  {SYSTEM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">סטטוס תפעולי</label>
                <select
                  value={form.operational_status ?? "Active"}
                  onChange={(e) => set("operational_status", e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
                >
                  {OPERATIONAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">ייעוד / Purpose</label>
                <textarea
                  value={form.purpose ?? ""}
                  onChange={(e) => set("purpose", e.target.value)}
                  rows={2}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded"
                  dir="auto"
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">בעלות והפעלה</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Owner</label>
                <input type="text" value={form.owner ?? ""} onChange={(e) => set("owner", e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="auto" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Operator</label>
                <input type="text" value={form.operator ?? ""} onChange={(e) => set("operator", e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="auto" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Manufacturer</label>
                <input type="text" value={form.manufacturer ?? ""} onChange={(e) => set("manufacturer", e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="auto" />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">תיאור ומקור</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Public Description</label>
                <textarea value={form.public_description ?? ""} onChange={(e) => set("public_description", e.target.value)}
                  rows={3} className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="auto" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">רמת מהימנות</label>
                  <select value={form.confidence_level ?? "Medium"} onChange={(e) => set("confidence_level", e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white">
                    {CONFIDENCE_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Last verified</label>
                  <input type="date" value={form.last_verified_date ?? ""} onChange={(e) => set("last_verified_date", e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Record status</label>
                  <select value={form.record_status ?? "Draft"} onChange={(e) => set("record_status", e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white">
                    {RECORD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Source ID</label>
                  <input type="text" value={form.source_id ?? ""} onChange={(e) => set("source_id", e.target.value)}
                    placeholder="SRC-0001" className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Citations</label>
                  <input type="text" value={form.citations ?? ""} onChange={(e) => set("citations", e.target.value)}
                    placeholder="SRC-0002, SRC-0014" className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded" dir="ltr" />
                </div>
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
              {mode === "create" ? "צור מערכת" : "שמור שינויים"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
