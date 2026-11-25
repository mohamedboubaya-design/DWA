"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { dayStyle } from "./map-story/map-style";

export type MapPoint = { id: string; name: string; lat: number; lng: number; status: "in" | "low" | "out" | "none"; onDuty: boolean };

/* Same cross glyph as the home's night pins; out of stock turns it into an X. */
const CROSS = '<svg viewBox="0 0 32 32" class="dpin-cross" aria-hidden="true"><path d="M12 3h8v8h8v8h-8v8h-8v-8H4v-8h8z" fill="currentColor"/></svg>';

function pinEl(p: MapPoint, onSelect?: (id: string) => void) {
  const el = document.createElement("div");
  el.className = "dpin";
  el.dataset.id = p.id;
  el.dataset.status = p.status;
  if (p.onDuty) el.dataset.duty = "1";
  el.innerHTML = `<button type="button" class="dpin-inner">${p.onDuty ? '<span class="dpin-ring"></span>' : ""}${CROSS}<span class="dpin-label"></span></button>`;
  el.querySelector(".dpin-label")!.textContent = p.name;
  const btn = el.querySelector("button")!;
  btn.setAttribute("aria-label", p.name);
  btn.addEventListener("click", () => onSelect?.(p.id));
  return el;
}

/*
 * MapLibre gives every marker element role="button" and an aria-label unless one
 * is set. Our pins already contain a real <button>, so the wrapper must not be a
 * second (nested) control: pins get role="none", the starting-point dot is an image.
 */
function quietMarker(el: HTMLElement) {
  el.setAttribute("role", "none");
  el.setAttribute("aria-label", "");
  return el;
}

export default function PharmacyMap({
  points,
  origin,
  highlighted,
  onSelect,
  youLabel,
}: {
  points: MapPoint[];
  origin: { lat: number; lng: number };
  highlighted?: string | null;
  onSelect?: (id: string) => void;
  /** Label of the starting-point dot (the visitor or Alger Centre). Omit to draw no dot. */
  youLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const selectRef = useRef(onSelect);
  useEffect(() => {
    selectRef.current = onSelect;
  });

  useEffect(() => {
    const map = new maplibregl.Map({
      container: ref.current!,
      style: dayStyle,
      center: [origin.lng, origin.lat],
      zoom: 12,
      scrollZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key = points.map((p) => p.id + p.status + (p.onDuty ? "d" : "")).join() + origin.lat + origin.lng + (youLabel ?? "");
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    const markers = points.map((p) => {
      const m = new maplibregl.Marker({ element: quietMarker(pinEl(p, (id) => selectRef.current?.(id))) }).setLngLat([p.lng, p.lat]).addTo(map);
      m.getElement().removeAttribute("aria-label");
      return m;
    });
    if (youLabel) {
      const you = document.createElement("div");
      you.className = "dpin-you";
      you.title = youLabel;
      you.setAttribute("role", "img");
      you.setAttribute("aria-label", youLabel);
      markers.unshift(new maplibregl.Marker({ element: you }).setLngLat([origin.lng, origin.lat]).addTo(map));
    }
    markersRef.current = markers;
    const bounds = new maplibregl.LngLatBounds([origin.lng, origin.lat], [origin.lng, origin.lat]);
    points.forEach((p) => bounds.extend([p.lng, p.lat]));
    map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    markersRef.current.forEach((m) => {
      const el = m.getElement();
      el.toggleAttribute("data-hot", !!el.dataset.id && el.dataset.id === highlighted);
    });
  }, [highlighted, key]);

  return <div ref={ref} className="h-full w-full" />;
}
