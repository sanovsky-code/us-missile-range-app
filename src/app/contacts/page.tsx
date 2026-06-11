"use client";

/**
 * /contacts — Salesforce-style "All Contacts" list view.
 *
 * Columns: Organization Name | Contact Type | Email | Phone.
 * Clicking the organization name opens the contact detail page.
 * Top-right action: "+ איש קשר חדש" → ContactFormModal in create mode.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Search, Users, ExternalLink, RefreshCw } from "lucide-react";
import type { CrmContactListItem, CrmContact } from "@/lib/types";
import ContactFormModal from "@/components/contacts/ContactFormModal";

export default function ContactsListPage() {
  const [contacts, setContacts] = useState<CrmContactListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [openCreate, setOpenCreate] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm-contacts", { cache: "no-store" });
      const data = await res.json();
      setContacts(data.contacts ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      (c.full_name ?? "").toLowerCase().includes(q) ||
      (c.organization_name ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q)
    );
  }, [contacts, query]);

  return (
    <main className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-7xl mx-auto p-6">
        <header className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-500" />
            <h1 className="text-2xl font-bold text-gray-900">אנשי קשר</h1>
            <span className="text-sm text-gray-500">({contacts.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reload}
              disabled={loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-200 hover:bg-gray-50 rounded-md text-gray-700"
              title="רענן"
            >
              <RefreshCw className={"w-4 h-4 " + (loading ? "animate-spin" : "")} />
            </button>
            <button
              onClick={() => setOpenCreate(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md"
            >
              <Plus className="w-4 h-4" />
              איש קשר חדש
            </button>
          </div>
        </header>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {/* Search bar */}
          <div className="p-3 border-b border-gray-200 flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute right-2 top-2.5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש לפי ארגון, שם, אימייל או טלפון..."
                className="w-full pr-8 pl-3 py-2 text-sm border border-gray-200 rounded-md"
              />
            </div>
            <span className="text-xs text-gray-500 mr-auto">
              מציג {filtered.length} מתוך {contacts.length}
            </span>
          </div>

          {/* Table */}
          {loading && contacts.length === 0 ? (
            <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              {contacts.length === 0
                ? <p>אין אנשי קשר עדיין. לחץ &quot;איש קשר חדש&quot; כדי להוסיף את הראשון.</p>
                : <p>לא נמצאו תוצאות לחיפוש.</p>}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">שם הארגון</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">שם איש הקשר</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">סוג</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">אימייל</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">טלפון</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase">אתר משויך</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/contacts/${c.id}`}
                        className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
                        dir="auto"
                      >
                        {c.organization_name || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-900" dir="auto">{c.full_name}</td>
                    <td className="px-4 py-3 text-gray-700">{c.contact_type || "—"}</td>
                    <td className="px-4 py-3 text-gray-700" dir="ltr">
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="hover:text-blue-700 hover:underline">{c.email}</a>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700" dir="ltr">
                      {c.phone ? (
                        <a href={`tel:${c.phone}`} className="hover:text-blue-700 hover:underline">{c.phone}</a>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.site_id ? (
                        <Link href={`/site/${c.site_id}`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline" dir="ltr">
                          {c.site_name ?? c.site_id}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {openCreate && (
        <ContactFormModal
          mode="create"
          onClose={() => setOpenCreate(false)}
          onSaved={async (saved: CrmContact) => {
            setOpenCreate(false);
            await reload();
            // Optimistic: scroll the new row into view if visible
            void saved;
          }}
        />
      )}
    </main>
  );
}
