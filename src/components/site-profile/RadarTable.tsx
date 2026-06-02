"use client";

import { useState } from "react";
import { Radar, Source } from "@/lib/types";
import { ConfidenceBadge, StatusBadge } from "@/components/ui/Badge";
import { Radio, ChevronDown, ChevronUp } from "lucide-react";
import CitedText from "@/components/ui/CitedText";

function isEnglish(text: string): boolean {
  const latinChars = text.match(/[a-zA-Z]/g)?.length || 0;
  return latinChars > text.length * 0.3;
}

function LtrText({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const text = typeof children === "string" ? children : "";
  if (text && isEnglish(text)) {
    return <span dir="ltr" className={`inline-block text-left ${className}`}>{children}</span>;
  }
  return <span className={className}>{children}</span>;
}

function RadarRow({ radar, sources }: { radar: Radar; sources: Source[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-gray-200 hover:bg-blue-50/40 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
              : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            }
            <span className="font-semibold text-gray-900">
              <LtrText>{radar.radar_name}</LtrText>
            </span>
          </div>
        </td>
        <td className="py-3 px-4 text-gray-600">
          <LtrText>{radar.radar_model || "—"}</LtrText>
        </td>
        <td className="py-3 px-4 text-gray-600">
          <LtrText>{radar.radar_type}</LtrText>
        </td>
        <td className="py-3 px-4 text-gray-600">
          <LtrText className={expanded ? "" : "line-clamp-1"}>{radar.purpose}</LtrText>
        </td>
        <td className="py-3 px-4">
          <StatusBadge status={radar.operational_status} />
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50/80 border-b border-gray-200">
          <td colSpan={5} className="px-4 py-4">
            <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
              {/* Wikipedia-style info box */}
              <table className="w-full text-sm border-collapse">
                <tbody>
                  <tr className="bg-blue-50 border-b border-gray-200">
                    <td colSpan={2} className="px-4 py-2.5 text-center">
                      <span className="font-bold text-gray-900 text-base">
                        <LtrText>{radar.radar_name}</LtrText>
                      </span>
                    </td>
                  </tr>

                  {radar.public_description && (
                    <tr className="border-b border-gray-100">
                      <td colSpan={2} className="px-4 py-3 text-gray-700 leading-relaxed text-sm" dir="ltr">
                        <CitedText text={radar.public_description} sources={sources} isEnglish />
                      </td>
                    </tr>
                  )}

                  <InfoRow label="דגם" value={radar.radar_model} />
                  <InfoRow label="סוג" value={radar.radar_type} />
                  <InfoRow label="תדר" value={radar.frequency_band} />
                  <InfoRow label="ייעוד" value={radar.purpose} />
                  <InfoRow label="בעלים" value={radar.owner} />
                  <InfoRow label="מפעיל" value={radar.operator} />
                  <InfoRow label="יצרן" value={radar.manufacturer} />
                  <InfoRow label="תאריך התקנה" value={radar.installation_date} />
                  <InfoRow label="תאריך שדרוג" value={radar.upgrade_date} />
                  <InfoRow label="תאריך תיקון" value={radar.fix_date} />

                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-2 bg-gray-50 font-semibold text-gray-600 text-xs w-36 align-top">סטטוס תפעולי</td>
                    <td className="px-4 py-2"><StatusBadge status={radar.operational_status} /></td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-2 bg-gray-50 font-semibold text-gray-600 text-xs w-36 align-top">רמת מהימנות</td>
                    <td className="px-4 py-2"><ConfidenceBadge level={radar.confidence_level} /></td>
                  </tr>

                  <InfoRow label="אימות אחרון" value={radar.last_verified_date} />
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <tr className="border-b border-gray-100">
      <td className="px-4 py-2 bg-gray-50 font-semibold text-gray-600 text-xs w-36 align-top">{label}</td>
      <td className="px-4 py-2 text-gray-800 text-sm">
        <LtrText>{value}</LtrText>
      </td>
    </tr>
  );
}

export default function RadarTable({ radars, sources = [] }: { radars: Radar[]; sources?: Source[] }) {
  if (!radars || radars.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">מערכות מכ&quot;מ</h2>
        <p className="text-sm text-gray-500">אין רשומות מכ&quot;מ זמינות לאתר זה.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Radio className="w-5 h-5 text-blue-500" />
        <h2 className="text-lg font-semibold text-gray-900">
          מערכות מכ&quot;מ ({radars.length})
        </h2>
      </div>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-right py-2.5 px-4 text-xs font-bold text-gray-600 uppercase tracking-wide">שם מכ&quot;מ</th>
              <th className="text-right py-2.5 px-4 text-xs font-bold text-gray-600 uppercase tracking-wide">דגם</th>
              <th className="text-right py-2.5 px-4 text-xs font-bold text-gray-600 uppercase tracking-wide">סוג</th>
              <th className="text-right py-2.5 px-4 text-xs font-bold text-gray-600 uppercase tracking-wide">ייעוד</th>
              <th className="text-right py-2.5 px-4 text-xs font-bold text-gray-600 uppercase tracking-wide">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {radars.map((radar) => (
              <RadarRow key={radar.radar_id} radar={radar} sources={sources} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">לחץ על שורה כדי לפתוח מידע מפורט</p>
    </div>
  );
}
