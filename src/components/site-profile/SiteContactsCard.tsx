"use client";

import { useEffect, useState } from "react";
import {
  Users, Plus, Edit2, Trash2, Save, X, Mail, Phone,
  Loader2, AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { Contact, SiteContact } from "@/lib/types";
import ImportedContactRow from "./ImportedContactRow";
import ContactHistoryFeed from "./ContactHistoryFeed";
import { useCurrentUser } from "@/lib/current-user";

interface Props {
  siteId: string;
  importedContacts?: Contact[];  // Read-only Public Affairs entries from the
                                  // Excel sources, surfaced below the editable list.
}

interface FormState {
  full_name: string;
  role_title: string;
  organization: string;
  phone: string;
  email: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  full_name: "",
  role_title: "",
  organization: "",
  phone: "",
  email: "",
  notes: "",
};

function fromContact(c: SiteContact): FormState {
  return {
    full_name: c.full_name ?? "",
    role_title: c.role_title ?? "",
    organization: c.organization ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    notes: c.notes ?? "",
  };
}

function isEmailValid(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function detectLtr(text: string): boolean {
  if (!text) return false;
  const latin = text.match(/[A-Za-z]/g)?.length || 0;
  const hebrew = text.match(/[֐-׿]/g)?.length || 0;
  return latin > hebrew * 2;
}

export default function SiteContactsCard({ siteId, importedContacts = [] }: Props) {
  const { currentUser } = useCurrentUser();
  const [contacts, setContacts] = useState<SiteContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Local copy so inline edits to imported contacts can refresh the
  // displayed row without round-tripping the parent page.
  const [importedContactsState, setImportedContactsState] = useState<Contact[]>(importedContacts);
  useEffect(() => { setImportedContactsState(importedContacts); }, [importedContacts]);
  // Per-user-managed-contact expand state: a Set of ids currently open.
  const [expandedSiteContactIds, setExpandedSiteContactIds] = useState<Set<number>>(new Set());
  const toggleSiteContactExpand = (id: number) => {
    setExpandedSiteContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  // Tick bumped after a successful save to nudge the inline history feed.
  const [siteContactHistoryTick, setSiteContactHistoryTick] = useState(0);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/contacts`, { cache: "no-store" });
      const data = await res.json();
      setContacts(data.contacts || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startAdd = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setEditingId(null);
    setAddOpen(true);
  };

  const startEdit = (c: SiteContact) => {
    setForm(fromContact(c));
    setError(null);
    setAddOpen(false);
    setEditingId(c.id);
  };

  const cancelForm = () => {
    setAddOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const submit = async () => {
    if (!form.full_name.trim()) {
      setError("שם מלא הוא שדה חובה.");
      return;
    }
    if (form.email && !isEmailValid(form.email)) {
      setError("כתובת דוא\"ל לא תקינה.");
      return;
    }
    setSubmitting(true); setError(null);
    try {
      const url = editingId
        ? `/api/contacts/${editingId}`
        : `/api/sites/${siteId}/contacts`;
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, updated_by: currentUser?.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה");
      cancelForm();
      await reload();
      // Nudge any open history feeds to refetch (PATCH path only).
      if (editingId) setSiteContactHistoryTick((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: number, name: string) => {
    if (!confirm(`למחוק את "${name}"?`)) return;
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "שגיאה במחיקה");
      }
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "שגיאה");
    }
  };

  const totalCount = contacts.length + importedContacts.length;
  const showEmptyState = !loading && totalCount === 0 && !addOpen;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-500" />
          <h2 className="text-lg font-semibold text-gray-900">
            אנשי קשר {totalCount > 0 && <span className="text-sm text-gray-500">({totalCount})</span>}
          </h2>
        </div>
        {!addOpen && editingId === null && (
          <button
            onClick={startAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Plus className="w-4 h-4" /> הוסף איש קשר
          </button>
        )}
      </div>

      {/* Add form */}
      {addOpen && (
        <ContactForm
          title="איש קשר חדש"
          form={form}
          setForm={setForm}
          error={error}
          submitting={submitting}
          onSubmit={submit}
          onCancel={cancelForm}
        />
      )}

      {/* List of user-managed contacts */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : showEmptyState ? (
        <p className="text-sm text-gray-500 text-center py-6">
          אין מידע ציבורי ליצירת קשר.
        </p>
      ) : contacts.length === 0 && importedContacts.length === 0 ? null : (
        <ul className="space-y-3">
          {contacts.map((c) =>
            editingId === c.id ? (
              <li key={c.id} className="border border-gray-100 rounded-lg">
                <ContactForm
                  title="עריכת איש קשר"
                  form={form}
                  setForm={setForm}
                  error={error}
                  submitting={submitting}
                  onSubmit={submit}
                  onCancel={cancelForm}
                  inline
                />
              </li>
            ) : (
              <li key={c.id} className="border border-gray-100 rounded-lg overflow-hidden">
                <div
                  className="p-3 hover:bg-gray-50/50 cursor-pointer"
                  onClick={() => toggleSiteContactExpand(c.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className="mt-1 flex-shrink-0">
                        {expandedSiteContactIds.has(c.id)
                          ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                          : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-medium text-gray-900"
                          dir={detectLtr(c.full_name) ? "ltr" : undefined}
                          style={detectLtr(c.full_name) ? { textAlign: "left" } : undefined}
                        >
                          {c.full_name}
                        </p>
                        {(c.role_title || c.organization) && (
                          <p className="text-sm text-gray-600 mt-0.5">
                            {[c.role_title, c.organization].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
                          {c.email && (
                            <a
                              href={`mailto:${c.email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                              dir="ltr"
                            >
                              <Mail className="w-3 h-3" /> {c.email}
                            </a>
                          )}
                          {c.phone && (
                            <span className="inline-flex items-center gap-1" dir="ltr">
                              <Phone className="w-3 h-3" /> {c.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-1 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => startEdit(c)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                        title="עריכה"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove(c.id, c.full_name)}
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                        title="מחיקה"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                {expandedSiteContactIds.has(c.id) && (
                  <div className="border-t border-gray-100 bg-white p-3 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <ContactField label="שם מלא"><span dir="auto">{c.full_name}</span></ContactField>
                      <ContactField label="תפקיד"><span dir="auto">{c.role_title || "—"}</span></ContactField>
                      <ContactField label="ארגון"><span dir="auto">{c.organization || "—"}</span></ContactField>
                      <ContactField label="טלפון">
                        {c.phone
                          ? <a href={`tel:${c.phone}`} className="text-blue-700 hover:underline" dir="ltr">{c.phone}</a>
                          : <span className="text-gray-400">—</span>}
                      </ContactField>
                      <ContactField label="אימייל" wide>
                        {c.email
                          ? <a href={`mailto:${c.email}`} className="text-blue-700 hover:underline" dir="ltr">{c.email}</a>
                          : <span className="text-gray-400">—</span>}
                      </ContactField>
                      <ContactField label="תיאור" wide>
                        {c.notes
                          ? <p className="text-gray-800 whitespace-pre-wrap leading-relaxed" dir="auto">{c.notes}</p>
                          : <span className="text-gray-400">—</span>}
                      </ContactField>
                    </div>
                    <ContactHistoryFeed kind="site_contact" contactId={String(c.id)} refreshTick={siteContactHistoryTick} />
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {/* Imported sub-section — editable + history-tracked. Each row is
          collapsed by default; clicking expands to show every field
          plus the change history. */}
      {importedContactsState.length > 0 && (
        <div className={contacts.length > 0 ? "mt-6 pt-4 border-t border-gray-100" : "mt-4"}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            אנשי קשר ציבוריים מהמקורות ({importedContactsState.length})
          </h3>
          <ul className="space-y-2">
            {importedContactsState.map((c) => (
              <ImportedContactRow
                key={c.contact_id}
                contact={c}
                onPatched={(patched) =>
                  setImportedContactsState((prev) => prev.map((x) => x.contact_id === patched.contact_id ? patched : x))
                }
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface ContactFormProps {
  title: string;
  form: FormState;
  setForm: (f: FormState) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  inline?: boolean;
}

function ContactForm({
  title, form, setForm, error, submitting, onSubmit, onCancel, inline = false,
}: ContactFormProps) {
  const setField = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className={`${inline ? "p-3" : "mb-4 p-4"} border ${inline ? "border-transparent bg-purple-50/30" : "border-purple-200 bg-purple-50/40"} rounded-lg space-y-3`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-2">
          <Users className="w-4 h-4" /> {title}
        </h3>
        <button onClick={onCancel} className="text-purple-700 hover:text-purple-900">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">שם מלא *</label>
          <input
            value={form.full_name}
            onChange={setField("full_name")}
            placeholder="לדוגמה: John Smith"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">תפקיד</label>
          <input
            value={form.role_title}
            onChange={setField("role_title")}
            placeholder="לדוגמה: Public Affairs Officer"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">ארגון</label>
          <input
            value={form.organization}
            onChange={setField("organization")}
            placeholder="לדוגמה: U.S. Space Force"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">טלפון</label>
          <input
            value={form.phone}
            onChange={setField("phone")}
            placeholder="+1 555 555 5555"
            dir="ltr"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">דוא&quot;ל</label>
          <input
            type="email"
            value={form.email}
            onChange={setField("email")}
            placeholder="name@example.com"
            dir="ltr"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">הערות</label>
          <textarea
            value={form.notes}
            onChange={setField("notes")}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          ביטול
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting || !form.full_name.trim()}
          className="inline-flex items-center gap-2 px-4 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:bg-gray-300"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          שמירה
        </button>
      </div>
    </div>
  );
}


function ContactField({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">{label}</div>
      <div className="text-gray-900">{children}</div>
    </div>
  );
}

