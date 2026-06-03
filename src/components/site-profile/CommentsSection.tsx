"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { SiteComment } from "@/lib/types";

interface Props {
  siteId: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso.replace(" ", "T") + "Z").toLocaleString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function CommentsSection({ siteId }: Props) {
  const [comments, setComments] = useState<SiteComment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/comments`, { cache: "no-store" });
      const data = await res.json();
      setComments(data.comments || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_text: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה בשליחה");
      setText("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-blue-500" />
        <h2 className="text-lg font-semibold text-gray-900">
          הערות ({comments.length})
        </h2>
      </div>

      <div className="space-y-2 mb-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="כתוב הערה חדשה..."
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={submitting || !text.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> שולח...</>
              : <><Send className="w-4 h-4" /> הוסף הערה</>}
          </button>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">עדיין אין הערות לאתר זה.</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50/40">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.comment_text}</p>
                <p className="text-[11px] text-gray-400 mt-2">
                  {formatDate(c.created_at)}{c.created_by ? ` · ${c.created_by}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
