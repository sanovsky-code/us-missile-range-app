import { SiteRangeActivity } from "@/lib/types";
import Badge, { StatusBadge, ConfidenceBadge } from "@/components/ui/Badge";
import { Activity } from "lucide-react";

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
        {activities.map((act) => (
          <div
            key={act.activity_id}
            className="border border-gray-100 rounded-lg p-4 hover:bg-gray-50"
          >
            <div className="flex items-center gap-2 mb-2">
              <Badge color={categoryColors[act.activity_category] || "gray"}>
                {categoryHebrew[act.activity_category] || act.activity_category}
              </Badge>
              <StatusBadge status={statusHebrew[act.status] || act.status} />
              <ConfidenceBadge level={act.confidence_level} />
            </div>
            <p className="text-sm text-gray-700 leading-relaxed text-left" dir="ltr">{act.activity_description}</p>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
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
        ))}
      </div>
    </div>
  );
}
