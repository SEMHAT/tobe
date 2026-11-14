import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  sub: string;
  link: string;
}

const LOME: [number, number] = [6.1375, 1.2123];

/** Carte OpenStreetMap (aucune clé nécessaire). */
export function EventMap({ points, height = 420, zoom = 13, interactive = true }: { points: MapPoint[]; height?: number; zoom?: number; interactive?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { zoomControl: interactive, attributionControl: true, dragging: interactive, scrollWheelZoom: interactive, touchZoom: interactive, doubleClickZoom: interactive });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    const icon = L.divIcon({
      className: "",
      html: '<div style="width:34px;height:34px;border-radius:12px 12px 12px 3px;transform:rotate(-45deg);background:linear-gradient(135deg,#ffd27a,#f2b233 45%,#e8891c);box-shadow:0 6px 18px rgba(0,0,0,.45);border:3px solid #0e0e12"></div>',
      iconSize: [34, 34],
      iconAnchor: [6, 34],
    });
    const bounds: [number, number][] = [];
    for (const p of points) {
      const m = L.marker([p.lat, p.lng], { icon }).addTo(map);
      bounds.push([p.lat, p.lng]);
      if (interactive) {
        const div = document.createElement("div");
        div.innerHTML = `<div style="font-weight:700;font-size:14px;margin-bottom:2px">${p.title.replace(/</g, "&lt;")}</div><div style="font-size:12px;color:#666">${p.sub.replace(/</g, "&lt;")}</div><div style="margin-top:6px;font-weight:700;color:#c47c06">Voir l'événement →</div>`;
        div.style.cursor = "pointer";
        div.onclick = () => nav(p.link);
        m.bindPopup(div);
      }
    }
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    else map.setView(bounds[0] ?? LOME, zoom);
    return () => {
      map.remove();
    };
  }, [points, zoom, interactive, nav]);
  return <div ref={el} style={{ height }} className="z-0 w-full overflow-hidden rounded-[20px] border border-line" />;
}
