"use client";

/**
 * One row in the "אנשי קשר ציבוריים מהמקורות" sub-section. Renders the
 * compact line (organization_name, type, email/phone/url) and toggles
 * an expand panel with the full details + edit form + history feed.
 *
 * The Excel-imported `contacts` table is now editable in-place via
 * PATCH /api/imported-contacts/:id. Every field change appears in
 * contact_field_history with kind="imported" and shows in the feed.
 */
import { useState } from "react";
import { Mail, Phone, ExternalLink, ChevronDown, ChevronUp, Pencil, Save, X, Loader2 } from "lucide-react";
import type { Contact } from "@/lib/types";
import ContactHistoryFeed from "./ContactHistoryFeed";
import { useCurrentUser } from "@/lib/current-user";

interface Props {
  contact: Contact;
  /** Bubbles up the patched contact so the parent card can refresh its
   * local list without a full reload. */
  onPatched: (patched: Contact) => void;
}

interface FormState {
  organization_name: string;
  contact_type: string;
  contact_email: string;
  contact_phone: string;
  contact_url: string;
  notes: string;
}

function toForm(c: Contact): FormState {
  return {
    organization_name: c.organization_name ?? "",
    contact_type: c.contact_type ?? "",
    contact_email: c.contact_email ?? "",
    contact_phone: c.contact_phone ?? "",
    contact_url: c.contact_url ?? "",
    notes: c.notes ?? "",
  };
}

export default function ImportedContactRow({ contact: c, onPatched }: Props) {
  const { currentUser } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => toForm(c));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped after a successful save so the history feed reloads.
  const [historyTick, setHistoryTick] = useState(0);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setForm(toForm(c));
    setEditing(true);
    setOpen(true);
    setError(null);
  };
  const cancel = () => { setEditing(false); setError(null); };

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/imported-contacts/${encodeURIComponent(c.contact_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, updated_by: currentUser?.trim() || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      onPatched(j.contact as Contact);
      setEditing(false);
      setHistoryTick((t) => t + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="border border-gray-100 rounded-lg bg-gray-50/30 overflow-hidden">
      {/* Compact row — always visible. Click to toggle expand. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-right p-3 flex items-start gap-2 hover:bg-gray-100/50"
      >
        <span className="mt-0.5 flex-shrink-0">
          {open
            ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
            : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-800 text-sm" dir="ltr" style={{ textAlign: "left" }}>
            {c.organization_name || <span className="text-gray-400">(ללא שם)</span>}
          </p>
          <p className="text-xs text-gray-500">{c.contact_type || "—"}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
            {c.contact_email && (
              <span className="inline-flex items-center gap-1 text-blue-600" dir="ltr">
                <Mail className="w-3 h-3" /> {c.contact_email}
              </span>
            )}
            {c.contact_phone && (
              <span className="inline-flex items-center gap-1" dir="ltr">
                <Phone className="w-3 h-3" /> {c.contact_phone}
              </span>
            )}
            {c.contact_url && (
              <span className="inline-flex items-center gap-1 text-blue-600 truncate max-w-xs" dir="ltr">
                <ExternalLink className="w-3 h-3" /> {c.contact_url}
              </span>
            )}
          </div>
        </div>
        <span
          onClick={startEdit}
          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md flex-shrink-0 cursor-pointer"
          title="עריכה"
        >
          <Pencil className="w-3.5 h-3.5" />
        </span>
      </button>

      {/* Expanded panel: full details + edit form + history feed. */}
      {open && (
        <div className="border-t border-gray-200 bg-white p-3 space-y-3">
          {editing ? (
            <ImportedContactForm
              form={form}
              setForm={setForm}
              error={error}
              busy={busy}
              onSubmit={save}
              onCancel={cancel}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <Field label="שם / ארגון">
                <span dir="auto">{c.organization_name || "—"}</span>
              </Field>
              <Field label="סוג">
                <span dir="auto">{c.contact_type || "—"}</span>
              </Field>
              <Field label="אימייל">
                {c.contact_email
                  ? <a href={`mailto:${c.contact_email}`} className="text-blue-700 hover:underline inline-flex items-center gap-1" dir="ltr">
                      <Mail className="w-3 h-3" /> {c.contact_email}
                    </a>
                  : <span className="text-gray-400">—</span>}
              </Field>
              <Field label="טלפון">
                {c.contact_phone
                  ? <a href={`tel:${c.contact_phone}`} className="text-blue-700 hover:underline inline-flex items-center gap-1" dir="ltr">
                      <Phone className="w-3 h-3" /> {c.contact_phone}
                    </a>
                  : <span className="text-gray-400">—</span>}
              </Field>
              <Field label="קישור" wide>
                {c.contact_url
                  ? <a href={c.contact_url} target="_blank" rel="noopener" className="text-blue-700 hover:underline inline-flex items-center gap-1" dir="ltr">
                      <ExternalLink className="w-3 h-3" /> {c.contact_url}
                    </a>
                  : <span className="text-gray-400">—</span>}
              </Field>
              <Field label="תיאור" wide>
                {c.notes
                  ? <p className="text-gray-800 whitespace-pre-wrap leading-relaxed" dir="auto">{c.notes}</p>
                  : <span className="text-gray-400">—</span>}
              </Field>
              <Field label="מקור">
                <a href={`/source/${c.source_id}`} className="text-blue-700 hover:underline font-mono" dir="ltr">
                  {c.source_id}
                </a>
              </Field>
              <Field label="contact_id">
                <span className="font-mono text-gray-700" dir="ltr">{c.contact_id}</span>
              </Field>
            </div>
          )}

          <ContactHistoryFeed kind="imported" contactId={c.contact_id} refreshTick={historyTick} />
        </div>
      )}
    </li>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">{label}</div>
      <div className="text-gray-900">{children}</div>
    </div>
  );
}

function ImportedContactForm({
  form, setForm, error, busy, onSubmit, onCancel,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-3 border border-purple-200 bg-purple-50/30 rounded-md p-3">
      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div>
          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">שם / ארגון</label>
          <input value={form.organization_name} onChange={set("organization_name")}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" dir="auto" />
        </div>
        <div>
          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">סוג</label>
          <input value={form.contact_type} onChange={set("contact_type")}
            placeholder="Public Affairs / Contracting / ..." className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" dir="auto" />
        </div>
        <div>
          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">אימייל</label>
          <input type="email" value={form.contact_email} onChange={set("contact_email")}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" dir="ltr" />
        </div>
        <div>
          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">טלפון</label>
          <input value={form.contact_phone} onChange={set("contact_phone")}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" dir="ltr" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">קישור</label>
          <input type="url" value={form.contact_url} onChange={set("contact_url")}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" dir="ltr" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">תיאור</label>
          <textarea value={form.notes} onChange={set("notes")} rows={3}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded" dir="auto" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} disabled={busy}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-white border border-gray-200 hover:bg-gray-50 rounded text-gray-700">
          <X className="w-3 h-3" /> ביטול
        </button>
        <button onClick={onSubmit} disabled={busy}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          שמור
        </button>
      </div>
    </div>
  );
}
