"use client";

/**
 * /contacts/[id] — Salesforce-style contact detail page.
 *
 * Layout (matches the screenshot the operator referenced):
 *   - Top header: salutation + full_name + summary line (title, account,
 *     phone, email, owner) + Edit / Delete / Back buttons.
 *   - Main column (left in LTR / wide in RTL grid):
 *       * "פרטי איש קשר" — every editable field, two columns inside
 *       * "כתובת"          — mailing address
 *       * "הערות"          — free-text notes
 *       * "מערכת"          — created/updated metadata
 *   - Sidebar (sticky on desktop, stacks on mobile):
 *       * ContactActivityTimeline — Comment / Task / Call quick-adds and feed
 */
import { useCallback, useEffect, useState, use as useReact } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2, Mail, Phone, Globe, User, Building2, ChevronRight,
  Edit2, Trash2, ArrowRight, ExternalLink,
} from "lucide-react";
import type { CrmContact } from "@/lib/types";
import ContactActivityTimeline from "@/components/contacts/ContactActivityTimeline";
import ContactFormModal from "@/components/contacts/ContactFormModal";

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = useReact(params);
  const contactId = Number(id);
  const router = useRouter();
  const [contact, setContact] = useState<CrmContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm-contacts/${contactId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setContact(json.contact as CrmContact);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [contactId]);

  useEffect(() => { reload(); }, [reload]);

  const onDelete = async () => {
    if (!contact) return;
    if (!confirm(`האם למחוק את איש הקשר "${contact.full_name}"? פעולה זו תמחק גם את כל הפעילויות הקשורות אליו.`)) return;
    const res = await fetch(`/api/crm-contacts/${contactId}`, { method: "DELETE" });
    if (res.ok) router.push("/contacts");
    else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Delete failed");
    }
  };

  if (loading && !contact) {
    return (
      <main className="min-h-screen bg-gray-50 p-6" dir="rtl">
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
      </main>
    );
  }
  if (!contact) {
    return (
      <main className="min-h-screen bg-gray-50 p-6" dir="rtl">
        <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-700">{error ?? "איש הקשר לא נמצא."}</p>
          <Link href="/contacts" className="inline-flex items-center gap-1 mt-3 text-blue-700 hover:underline">
            <ArrowRight className="w-4 h-4" /> חזרה לאנשי קשר
          </Link>
        </div>
      </main>
    );
  }

  const display = (contact.salutation ? contact.salutation + " " : "") + contact.full_name;

  return (
    <main className="min-h-screen bg-gray-50 pb-12" dir="rtl">
      {/* Sticky top header — title row + summary row + actions */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <nav className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <Link href="/contacts" className="hover:text-blue-700">אנשי קשר</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-900">{contact.organization_name ?? contact.full_name}</span>
          </nav>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-gray-500">Contact</div>
              <h1 className="text-2xl font-bold text-gray-900" dir="auto">{display}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-200 hover:bg-gray-50 rounded-md text-gray-700">
                <Edit2 className="w-4 h-4" /> עריכה
              </button>
              <button onClick={onDelete}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-red-200 hover:bg-red-50 rounded-md text-red-700">
                <Trash2 className="w-4 h-4" /> מחיקה
              </button>
            </div>
          </div>

          {/* Summary chips */}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <SummaryItem label="Title" value={contact.title} />
            <SummaryItem label="Account" value={contact.organization_name} />
            <SummaryItem label="Phone" value={contact.phone} dir="ltr"
              href={contact.phone ? `tel:${contact.phone}` : undefined} />
            <SummaryItem label="Email" value={contact.email} dir="ltr"
              href={contact.email ? `mailto:${contact.email}` : undefined} />
            <SummaryItem label="Owner" value={contact.owner} />
          </div>
        </div>
      </div>

      {/* Two-column body */}
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:items-start">
        {/* Sidebar (sticky on desktop) — Activity timeline */}
        <aside className="lg:col-span-4 lg:order-first">
          <div className="lg:sticky lg:top-4">
            <ContactActivityTimeline contactId={contactId} />
          </div>
        </aside>

        {/* Main column */}
        <div className="lg:col-span-8 space-y-4">
          <DetailsCard contact={contact} />

          <Card title="כתובת">
            {contact.mailing_address ? (
              <p className="text-sm text-gray-900 whitespace-pre-wrap" dir="auto">{contact.mailing_address}</p>
            ) : <EmptyValue />}
          </Card>

          <Card title="הערות">
            {contact.notes ? (
              <p className="text-sm text-gray-900 whitespace-pre-wrap" dir="auto">{contact.notes}</p>
            ) : <EmptyValue />}
          </Card>

          <Card title="מידע מערכת">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DLRow label="נוצר על־ידי">{contact.created_by ?? "—"}</DLRow>
              <DLRow label="נוצר בתאריך">{fmtDateTime(contact.created_at)}</DLRow>
              <DLRow label="עודכן על־ידי">{contact.updated_by ?? "—"}</DLRow>
              <DLRow label="עודכן בתאריך">{fmtDateTime(contact.updated_at)}</DLRow>
            </div>
          </Card>
        </div>
      </div>

      {editing && (
        <ContactFormModal
          mode="edit"
          initial={contact}
          onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await reload(); }}
        />
      )}
    </main>
  );
}


function DetailsCard({ contact }: { contact: CrmContact }) {
  return (
    <Card title="פרטי איש קשר">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <DLRow label="שם מלא">{contact.full_name}</DLRow>
        <DLRow label="תפקיד">{contact.title ?? "—"}</DLRow>
        <DLRow label="שם הארגון">{contact.organization_name ?? "—"}</DLRow>
        <DLRow label="מחלקה">{contact.department ?? "—"}</DLRow>
        <DLRow label="סוג איש קשר">{contact.contact_type ?? "—"}</DLRow>
        <DLRow label="כפיפות / Reports To">{contact.reports_to ?? "—"}</DLRow>
        <DLRow label="אימייל" dir="ltr">
          {contact.email
            ? <a href={`mailto:${contact.email}`} className="text-blue-700 hover:underline inline-flex items-center gap-1"><Mail className="w-3 h-3" />{contact.email}</a>
            : "—"}
        </DLRow>
        <DLRow label="טלפון" dir="ltr">
          {contact.phone
            ? <a href={`tel:${contact.phone}`} className="text-blue-700 hover:underline inline-flex items-center gap-1"><Phone className="w-3 h-3" />{contact.phone}</a>
            : "—"}
        </DLRow>
        <DLRow label="נייד" dir="ltr">
          {contact.mobile
            ? <a href={`tel:${contact.mobile}`} className="text-blue-700 hover:underline inline-flex items-center gap-1"><Phone className="w-3 h-3" />{contact.mobile}</a>
            : "—"}
        </DLRow>
        <DLRow label="קישור" dir="ltr">
          {contact.contact_url
            ? <a href={contact.contact_url} target="_blank" rel="noopener" className="text-blue-700 hover:underline inline-flex items-center gap-1"><Globe className="w-3 h-3" />{contact.contact_url}</a>
            : "—"}
        </DLRow>
        <DLRow label="אחראי / Owner">
          {contact.owner ? <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{contact.owner}</span> : "—"}
        </DLRow>
        <DLRow label="אתר משויך">
          {contact.site_id ? (
            <Link href={`/site/${contact.site_id}`} className="text-blue-700 hover:underline inline-flex items-center gap-1" dir="ltr">
              <Building2 className="w-3 h-3" />
              {contact.site_name ?? contact.site_id}
              <ExternalLink className="w-3 h-3" />
            </Link>
          ) : "—"}
        </DLRow>
        <DLRow label="מקור (Source)">
          {contact.source_id ? (
            <Link href={`/source/${contact.source_id}`} className="text-blue-700 hover:underline" dir="ltr">
              {contact.source_id}
            </Link>
          ) : "—"}
        </DLRow>
      </div>
    </Card>
  );
}


function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <header className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function DLRow({ label, dir, children }: { label: string; dir?: "ltr" | "rtl"; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-gray-900 mt-0.5" dir={dir}>{children}</dd>
    </div>
  );
}

function EmptyValue() {
  return <p className="text-sm text-gray-400 italic">אין מידע</p>;
}

function SummaryItem({ label, value, href, dir }: { label: string; value?: string; href?: string; dir?: "ltr" | "rtl" }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-gray-500 font-semibold">{label}</div>
      <div className="text-sm text-gray-900 truncate" dir={dir} title={value ?? undefined}>
        {value
          ? (href ? <a href={href} className="text-blue-700 hover:underline">{value}</a> : value)
          : <span className="text-gray-400">—</span>}
      </div>
    </div>
  );
}


function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso.replace(" ", "T") + "Z").toLocaleString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}
