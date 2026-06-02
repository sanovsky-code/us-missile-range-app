"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Site } from "@/lib/types";
import SiteHeader from "@/components/site-profile/SiteHeader";
import SiteOverview from "@/components/site-profile/SiteOverview";
import RadarTable from "@/components/site-profile/RadarTable";
import ActivitiesSection from "@/components/site-profile/ActivitiesSection";
import ContactsSection from "@/components/site-profile/ContactsSection";
import SourcesSection from "@/components/site-profile/SourcesSection";
import { ArrowRight, Loader2, Calendar, ShieldCheck } from "lucide-react";

const SiteMiniMap = dynamic(() => import("@/components/site-profile/SiteMiniMap"), {
  ssr: false,
  loading: () => <div className="h-[200px] bg-gray-100 rounded-xl animate-pulse" />,
});

export default function SiteProfilePage() {
  const params = useParams();
  const siteId = params.siteId as string;
  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sites/${siteId}`)
      .then((res) => {
        if (!res.ok) throw new Error("האתר לא נמצא");
        return res.json();
      })
      .then((data) => {
        setSite(data.site);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-lg text-gray-600">{error || "האתר לא נמצא"}</p>
        <Link href="/map" className="text-blue-600 hover:text-blue-800 font-medium">
          חזרה למפה
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <Link
          href="/map"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowRight className="w-4 h-4" /> חזרה למפה
        </Link>

        <SiteHeader site={site} />

        <SiteMiniMap
          latitude={site.latitude}
          longitude={site.longitude}
          sizeCategory={site.size_category}
          siteName={site.site_name}
        />

        <SiteOverview site={site} />

        <ActivitiesSection activities={site.activities || []} />

        <RadarTable radars={site.radars || []} sources={site.sources || []} />

        <ContactsSection contacts={site.contacts || []} />

        <SourcesSection sources={site.sources || []} />

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">איכות נתונים</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-xs text-gray-500">מהימנות</p>
                <p className="text-sm font-medium">{site.confidence_level}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-xs text-gray-500">אימות אחרון</p>
                <p className="text-sm font-medium">{site.last_verified_date}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-xs text-gray-500">סטטוס רשומה</p>
                <p className="text-sm font-medium">{site.record_status}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
