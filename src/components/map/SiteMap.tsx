"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { SiteListItem } from "@/lib/types";
import { MAP_CENTER, MAP_ZOOM, TILE_URL, TILE_ATTRIBUTION, SIZE_CATEGORY_COLORS } from "@/lib/constants";
import SitePopupCard from "./SitePopupCard";
import MapLegend from "./MapLegend";
import "leaflet/dist/leaflet.css";

function createSiteIcon(sizeCategory: string): L.DivIcon {
  const color = SIZE_CATEGORY_COLORS[sizeCategory] || "#6b7280";
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:22px;height:22px;border-radius:50%;border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });
}

function createClusterIcon(cluster: { getChildCount(): number }) {
  const count = cluster.getChildCount();
  let color = "#22c55e";
  let size = 36;
  if (count > 20) { color = "#ef4444"; size = 48; }
  else if (count > 10) { color = "#f97316"; size = 44; }
  else if (count > 5) { color = "#3b82f6"; size = 40; }

  return L.divIcon({
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:13px;">${count}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

interface SiteMapProps {
  sites: SiteListItem[];
}

export default function SiteMap({ sites }: SiteMapProps) {
  useEffect(() => {
    // Fix Leaflet default icon issue in webpack
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={MAP_CENTER}
        zoom={MAP_ZOOM}
        className="w-full h-full"
        scrollWheelZoom={true}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <MarkerClusterGroup
          chunkedLoading
          iconCreateFunction={createClusterIcon}
          maxClusterRadius={50}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
        >
          {sites.map((site) => (
            <Marker
              key={site.site_id}
              position={[site.latitude, site.longitude]}
              icon={createSiteIcon(site.size_category)}
            >
              <Popup maxWidth={350} minWidth={280}>
                <SitePopupCard site={site} />
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
      <MapLegend />
    </div>
  );
}
