"use client";

/**
 * Documents card for the Opportunity detail page.
 *
 * The operator pastes URLs (OneDrive / SharePoint / network drive) — we do
 * NOT host the file. Each row has a title, a clickable URL, an optional
 * doc_type chip (Proposal / RFI / Contract / Presentation / Spec / Other),
 * and free-text notes.
 */
import { useCallback, useEffect, useState } from "react";
import { FileText, ExternalLink, Plus, Loader2, Trash2 } from "lucide-react";
import type { OpportunityDocument, OpportunityDocType } from "@/lib/types";
import { OPPORTUNITY_DOC_TYPES } from "@/lib/types";
import { useCurrentUser } from "@/lib/current-user";

interface Props {
  opportunityId: number;
}

const DOC_TYPE_HEBREW: Record<OpportunityDocType, string> = {
  Proposal: "הצעה",
  RFI: "RFI",
  Contract: "חוזה",
  Presentation: "מצגת",
  Spec: "מפרט",
  Other: "אחר",
};

const DOC_TYPE_CLS: Record<OpportunityDocType, string> = {
  Proposal: "bg-blue-50 text-blue-700 border-blue-200",
  RFI: "bg-cyan-50 text-cyan-700 border-cyan-200",
  Contract: "bg-green-50 text-green-700 border-green-200",
  Presentation: "bg-purple-50 text-purple-700 border-purple-200",
  Spec: "bg-amber-50 text-amber-700 border-amber-200",
  Other: "bg-gray-50 text-gray-700 border-gray-200",
};

export default function OpportunityDocumentsCard({ opportunityId }: Props) {
  const [docs, setDocs] = useState<OpportunityDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/documents`, { cache: "no-store" });
      const data = await res.json();
      setDocs(data.documents ?? []);
    } finally { setLoading(false); }
  }, [opportunityId]);

  useEffect(() => { reload(); }, [reload]);

  const remove = async (id: number) => {
    if (!confirm("האם להסיר את הקישור הזה?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/opportunity-documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reload();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <header className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          <h3 className="text-base font-semibold text-gray-900">מסמכים</h3>
          <span className="text-xs text-gray-400">({docs.length})</span>
        </div>
        <button
          onClick={() => setOpenForm((v) => !v)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md"
        >
          <Plus className="w-3.5 h-3.5" /> הוסף קישור
        </button>
      </header>

      {openForm && (
        <DocForm
          opportunityId={opportunityId}
          onCancel={() => setOpenForm(false)}
          onCreated={async () => { setOpenForm(false); await reload(); }}
        />
      )}

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-800">{error}</div>
      )}

      <div className="p-3 space-y-2">
        {loading && (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        )}
        {!loading && docs.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-500">
            <FileText className="w-7 h-7 mx-auto text-gray-300 mb-2" />
            אין מסמכים. הדבק קישור ל-OneDrive / SharePoint / כונן רשת.
          </div>
        )}
        {!loading && docs.map((d) => (
          <article key={d.id} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50/40">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener"
                    className="font-medium text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1"
                    dir="auto"
                  >
                    {d.title}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {d.doc_type && (
                    <span className={
                      "text-[10px] px-1.5 py-0.5 rounded-full border " + DOC_TYPE_CLS[d.doc_type as OpportunityDocType]
                    }>
                      {DOC_TYPE_HEBREW[d.doc_type as OpportunityDocType] ?? d.doc_type}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5 truncate" dir="ltr" title={d.url}>{d.url}</p>
                {d.notes && (
                  <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap" dir="auto">{d.notes}</p>
                )}
                {d.created_by && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    על־ידי {d.created_by}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(d.id)}
                className="text-gray-300 hover:text-red-600 p-1"
                title="מחק"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}


function DocForm({
  opportunityId, onCancel, onCreated,
}: {
  opportunityId: number;
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const { currentUser } = useCurrentUser();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [docType, setDocType] = useState<OpportunityDocType | "">("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) { setError("כותרת היא חובה"); return; }
    if (!url.trim()) { setError("קישור הוא חובה"); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/documents`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          url: url.trim(),
          doc_type: docType || undefined,
          notes: notes.trim() || undefined,
          created_by: currentUser || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setTitle(""); setUrl(""); setDocType(""); setNotes("");
      await onCreated();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="כותרת המסמך"
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md"
          dir="auto"
        />
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as OpportunityDocType | "")}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white"
        >
          <option value="">— סוג מסמך —</option>
          {OPPORTUNITY_DOC_TYPES.map((t) => (
            <option key={t} value={t}>{DOC_TYPE_HEBREW[t]} ({t})</option>
          ))}
        </select>
      </div>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://onedrive.... / https://sharepoint...."
        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md"
        dir="ltr"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="הערות (אופציונלי)"
        rows={2}
        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md"
        dir="auto"
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onCancel} disabled={busy}
          className="px-3 py-1.5 text-xs bg-white border border-gray-200 hover:bg-gray-50 rounded-md text-gray-700">
          ביטול
        </button>
        <button onClick={submit} disabled={busy}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          הוסף קישור
        </button>
      </div>
    </div>
  );
}
