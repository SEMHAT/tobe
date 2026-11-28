import { lazy, Suspense } from "react";
import type { MapPoint } from "./Map";

// La carte (Leaflet, ~440 Ko) n'est chargée que lorsqu'elle s'affiche.
const Inner = lazy(() => import("./Map").then((m) => ({ default: m.EventMap })));

export function EventMap(props: { points: MapPoint[]; height?: number; zoom?: number; interactive?: boolean }) {
  return (
    <Suspense fallback={<div className="animate-pulse rounded-3xl bg-card-2" style={{ height: props.height ?? 420 }} />}>
      <Inner {...props} />
    </Suspense>
  );
}
