"use client";

/**
 * Shared create/edit dialog for CRM contacts.
 *
 * mode="create" → POST /api/crm-contacts
 * mode="edit"   → PATCH /api/crm-contacts/:id
 *
 * Side-loads the list of Sites so the operator can pick a "Site (Account)"
 * via a dropdown instead of typing a site_id by hand.
 */
import { useEffect, useState } from "react";
import { Loader2, X, AlertCircle } from "lucide-react";
import type { CrmContact } from "@/lib/types";
import { CRM_CONTACT_TYPES } from "@/lib/types";
import LookupField from "@/components/ui/LookupField";
import { useCurrentUser } from "@/lib/current-user";

interface SiteOption { site_id: string; site_name: string; country?: string; }
interface SourceOption { source_id: string; source_title: string; source_type?: string; publisher?: string; }

interface Props {
  mode: "create" | "edit";
  initial?: CrmContact;
  onClose: () => void;
  onSaved: (saved: CrmContact) => void;
}

const SALUTATIONS = ["", "Mr.", "Mrs.", "Ms.", "Dr.", "Prof."];

export default function ContactFormModal({ mode, initial, onClose, onSaved }: Props) {
  const { currentUser } = useCurrentUser();
  const [form, setForm] = useState<Partial<CrmContact>>(() => ({
    salutation: "", first_name: "", last_name: "", title: "", organization_name: "",
    contact_type: "", email: "", phone: "", mobile: "", contact_url: "",
    department: "", reports_to: "", owner: "", site_id: "",
    mailing_address: "", notes: "", source_id: "",
    ...(initial ?? {}),
  }));
  // null = loading; [] = loaded-and-empty.
  const [sites, setSites] = useState<SiteOption[] | null>(null);
  const [sources, setSources] = useState<SourceOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Side-load the lookup option lists. Both are small enough (~hundreds
  // of rows) to fetch once and filter client-side via LookupField.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/sites");
        const j = await r.json();
        setSites((j.sites ?? []).map((s: { site_id: string; site_name: string; country?: string }) => ({
          site_id: s.site_id, site_name: s.site_name, country: s.country,
        })));
      } catch { setSites([]); }
    })();
    (async () => {
      try {
        const r = await fetch("/api/sources");
        const j = await r.json();
        setSources((j.sources ?? []) as SourceOption[]);
      } catch { setSources([]); }
    })();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof CrmContact>(k: K, v: CrmContact[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async () => {
    // Salesforce convention: last_name is required, first_name is optional.
    if (!form.last_name?.trim()) { setError("שם משפחה הוא חובה"); return; }
    setBusy(true); setError(null);
    try {
      const url = mode === "create" ? "/api/crm-contacts" : `/api/crm-contacts/${initial!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      // Strip empty strings — server-side they normalize to NULL anyway,
      // and this keeps the payload small. Drop the derived `full_name`
      // field too; the server re-derives it from first/last.
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) {
        if (k === "full_name") continue;
        if (typeof v === "string" && v.trim() === "") continue;
        if (v === undefined || v === null) continue;
        payload[k] = typeof v === "string" ? v.trim() : v;
      }
      // Attribution from the app-wide identity context.
      if (currentUser) {
        payload[mode === "create" ? "created_by" : "updated_by"] = currentUser;
      }
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      onSaved(j.contact as CrmContact);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose} dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === "create" ? "איש קשר חדש" : "עריכת איש קשר"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <section>
            <h3 className="text-xs font-semibold text-gray-700 mb-2">פרטי איש קשר</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="כינוי">
                <select value={form.salutation ?? ""} onChange={(e) => set("salutation", e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded">
                  {SALUTATIONS.map((s) => <option key={s} value={s}>{s || "—"}</option>)}
                </select>
              </Field>
              <Field label="תפקיד / Title">
                <input value={form.title ?? ""} onChange={(e) => set("title", e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded" />
              </Field>
              <Field label="שם פרטי">
                <input value={form.first_name ?? ""} onChange={(e) => set("first_name", e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded" dir="auto" />
              </Field>
              <Field label="שם משפחה *" required>
                <input value={form.last_name ?? ""} onChange={(e) => set("last_name", e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded" dir="auto" />
              </Field>
              <Field label="שם הארגון">
                <input value={form.organization_name ?? ""} onChange={(e) => set("organization_name", e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded" />
              </Field>
              <Field label="מחלקה">
                <input value={form.department ?? ""} onChange={(e) => set("department", e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded" />
              </Field>
              <Field label="סוג איש קשר">
                <select value={form.contact_type ?? ""} onChange={(e) => set("contact_type", e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded">
                  <option value="">—</option>
                  {CRM_CONTACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <div />{/* spacer to keep two-col grid even */}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-gray-700 mb-2">פרטי קשר</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="אימייל">
                <input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded" dir="ltr" />
              </Field>
              <Field label="טלפון">
                <input type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded" dir="ltr" />
              </Field>
              <Field label="נייד">
                <input type="tel" value={form.mobile ?? ""} onChange={(e) => set("mobile", e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded" dir="ltr" />
              </Field>
              <Field label="קישור">
                <input type="url" value={form.contact_url ?? ""} onChange={(e) => set("contact_url", e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded" dir="ltr" />
              </Field>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-gray-700 mb-2">שיוך וניהול</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="אתר משויך">
                <LookupField<SiteOption>
                  value={form.site_id ?? null}
                  onChange={(v) => set("site_id", v ?? "")}
                  options={sites}
                  getKey={(s) => s.site_id}
                  filter={(s, q) => {
                    const ql = q.toLowerCase();
                    return s.site_id.toLowerCase().includes(ql)
                      || (s.site_name ?? "").toLowerCase().includes(ql)
                      || (s.country ?? "").toLowerCase().includes(ql);
                  }}
                  renderRow={(s) => (
                    <div>
                      <div className="font-medium" dir="ltr">{s.site_name}</div>
                      <div className="text-xs text-gray-500 font-mono" dir="ltr">
                        {s.site_id}{s.country ? ` · ${s.country}` : ""}
                      </div>
                    </div>
                  )}
                  renderChip={(s) => (
                    <span dir="ltr">
                      {s.site_name} <span className="text-xs text-gray-500 font-mono">({s.site_id})</span>
                    </span>
                  )}
                  placeholder="חיפוש לפי שם אתר, מזהה או מדינה..."
                />
              </Field>
              <Field label="אחראי / Owner">
                <input value={form.owner ?? ""} onChange={(e) => set("owner", e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded" />
              </Field>
              <Field label="כפיפות / Reports To">
                <input value={form.reports_to ?? ""} onChange={(e) => set("reports_to", e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded" />
              </Field>
              <Field label="מקור (Source)">
                <LookupField<SourceOption>
                  value={form.source_id ?? null}
                  onChange={(v) => set("source_id", v ?? "")}
                  options={sources}
                  getKey={(s) => s.source_id}
                  filter={(s, q) => {
                    const ql = q.toLowerCase();
                    return s.source_id.toLowerCase().includes(ql)
                      || (s.source_title ?? "").toLowerCase().includes(ql)
                      || (s.publisher ?? "").toLowerCase().includes(ql);
                  }}
                  renderRow={(s) => (
                    <div>
                      <div className="font-mono text-xs text-gray-500" dir="ltr">
                        {s.source_id}{s.source_type ? ` · ${s.source_type}` : ""}
                      </div>
                      <div className="text-sm text-gray-900 truncate" dir="ltr" title={s.source_title}>
                        {s.source_title}
                      </div>
                      {s.publisher && <div className="text-xs text-gray-500 truncate" dir="ltr">{s.publisher}</div>}
                    </div>
                  )}
                  renderChip={(s) => (
                    <span>
                      <span className="font-mono text-xs text-gray-500" dir="ltr">{s.source_id}</span>{" — "}
                      <span dir="ltr">{s.source_title}</span>
                    </span>
                  )}
                  placeholder="חיפוש לפי SRC-id, כותרת או מפרסם..."
                />
              </Field>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-gray-700 mb-2">פרטים נוספים</h3>
            <Field label="כתובת למשלוח">
              <textarea value={form.mailing_address ?? ""} onChange={(e) => set("mailing_address", e.target.value)}
                rows={2} className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded resize-y" dir="auto" />
            </Field>
            <Field label="הערות">
              <textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)}
                rows={3} className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded resize-y mt-2" dir="auto" />
            </Field>
          </section>
        </div>

        <footer className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-200 bg-gray-50/50">
          <button onClick={onClose} disabled={busy}
            className="px-3 py-1.5 text-sm bg-white border border-gray-200 hover:bg-gray-50 rounded-md text-gray-700">
            ביטול
          </button>
          <button onClick={submit} disabled={busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {mode === "create" ? "צור איש קשר" : "שמור שינויים"}
          </button>
        </footer>
      </div>
    </div>
  );
}


function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={"block text-xs mb-0.5 " + (required ? "text-red-600" : "text-gray-600")}>{label}</label>
      {children}
    </div>
  );
}
