"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { TILE_URL, TILE_ATTRIBUTION, SIZE_CATEGORY_COLORS } from "@/lib/constants";
import "leaflet/dist/leaflet.css";

interface SiteMiniMapProps {
  latitude: number;
  longitude: number;
  sizeCategory: string;
  siteName: string;
}

export default function SiteMiniMap({ latitude, longitude, sizeCategory }: SiteMiniMapProps) {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  const color = SIZE_CATEGORY_COLORS[sizeCategory] || "#6b7280";
  const icon = L.divIcon({
    className: "",
    html: `<div style="background:${color};width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <MapContainer
        center={[latitude, longitude]}
        zoom={8}
        className="w-full h-[200px]"
        scrollWheelZoom={false}
        zoomControl={false}
        dragging={false}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <Marker position={[latitude, longitude]} icon={icon} />
      </MapContainer>
    </div>
  );
}
