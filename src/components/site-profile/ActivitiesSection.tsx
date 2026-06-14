"use client";

import { useState } from "react";
import { SiteRangeActivity } from "@/lib/types";
import Badge, { StatusBadge, ConfidenceBadge } from "@/components/ui/Badge";
import { Activity, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

const categoryColors: Record<string, string> = {
  "Missile Test": "red",
  "Space Launch": "purple",
  "Radar Tracking": "blue",
  "Telemetry": "blue",
  "Missile Defense": "orange",
  "Range Safety": "green",
  "Aerospace Test": "purple",
  "Other": "gray",
};

const categoryHebrew: Record<string, string> = {
  "Missile Test": "ניסוי טילים",
  "Space Launch": "שיגור לחלל",
  "Radar Tracking": "מעקב מכ\"מ",
  "Telemetry": "טלמטריה",
  "Missile Defense": "הגנה מפני טילים",
  "Range Safety": "בטיחות מטווח",
  "Aerospace Test": "ניסוי אווירי-חללי",
  "Other": "אחר",
};

const statusHebrew: Record<string, string> = {
  Current: "פעיל",
  Historical: "היסטורי",
  Planned: "מתוכנן",
  Unknown: "לא ידוע",
};

export default function ActivitiesSection({ activities }: { activities: SiteRangeActivity[] }) {
  // Per-row expand state. Activities are display-only (no CRUD), so the
  // expand panel just shows extra columns: activity_id, source_id link,
  // raw status (so the operator sees the underlying English value not
  // only the Hebrew badge), and a full multi-line description if the
  // collapsed row truncated it.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!activities || activities.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">פעילויות</h2>
        <p className="text-sm text-gray-500">אין רשומות פעילות זמינות לאתר זה.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-green-500" />
        <h2 className="text-lg font-semibold text-gray-900">
          פעילויות ({activities.length})
        </h2>
      </div>
      <div className="grid gap-3">
        {activities.map((act) => {
          const isOpen = expanded.has(act.activity_id);
          return (
            <div
              key={act.activity_id}
              className="border border-gray-100 rounded-lg overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggle(act.activity_id)}
                className="w-full text-right p-4 hover:bg-gray-50 flex items-start gap-2"
              >
                <span className="mt-1 flex-shrink-0">
                  {isOpen
                    ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                    : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge color={categoryColors[act.activity_category] || "gray"}>
                      {categoryHebrew[act.activity_category] || act.activity_category}
                    </Badge>
                    <StatusBadge status={statusHebrew[act.status] || act.status} />
                    <ConfidenceBadge level={act.confidence_level} />
                  </div>
                  <p
                    className={"text-sm text-gray-700 leading-relaxed text-left " + (isOpen ? "" : "line-clamp-2")}
                    dir="ltr"
                  >
                    {act.activity_description}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                    {act.missile_or_system_type && (
                      <span>מערכות: <span dir="ltr">{act.missile_or_system_type}</span></span>
                    )}
                    {act.start_year && (
                      <span>
                        {act.start_year}
                        {act.end_year ? ` – ${act.end_year}` : " – הווה"}
                      </span>
                    )}
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 bg-gray-50/40 p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <ActivityField label="activity_id">
                      <span className="font-mono text-gray-700" dir="ltr">{act.activity_id}</span>
                    </ActivityField>
                    <ActivityField label="activity_category">
                      <span dir="ltr">{act.activity_category}</span>
                    </ActivityField>
                    <ActivityField label="status">
                      <span dir="ltr">{act.status}</span>
                      <span className="text-gray-500"> ({statusHebrew[act.status] || act.status})</span>
                    </ActivityField>
                    <ActivityField label="confidence_level">
                      <span dir="ltr">{act.confidence_level}</span>
                    </ActivityField>
                    <ActivityField label="missile_or_system_type">
                      <span dir="ltr">{act.missile_or_system_type || "—"}</span>
                    </ActivityField>
                    <ActivityField label="years">
                      {act.start_year || act.end_year
                        ? <span dir="ltr">{act.start_year ?? "—"} – {act.end_year ?? "הווה"}</span>
                        : <span className="text-gray-400">—</span>}
                    </ActivityField>
                    <ActivityField label="activity_description" wide>
                      <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-left" dir="ltr">
                        {act.activity_description}
                      </p>
                    </ActivityField>
                    <ActivityField label="source_id">
                      {act.source_id
                        ? <a href={`/source/${act.source_id}`} className="text-blue-700 hover:underline inline-flex items-center gap-1 font-mono" dir="ltr">
                            {act.source_id}<ExternalLink className="w-3 h-3" />
                          </a>
                        : <span className="text-gray-400">—</span>}
                    </ActivityField>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityField({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">{label}</div>
      <div className="text-gray-900">{children}</div>
    </div>
  );
}
