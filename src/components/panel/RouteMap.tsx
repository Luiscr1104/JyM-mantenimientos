import * as React from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export interface RouteMapStop {
    order: number;
    lat: number;
    lng: number;
    label: string;
}

interface Props {
    stops: RouteMapStop[];
    base: { lat: number; lng: number } | null;
    polyline: Array<[number, number]>;
    estimated?: boolean;
    height?: number;
}

const DEFAULT_CENTER: [number, number] = [10.4709, -84.6453];

function numberedIcon(order: number) {
    return L.divIcon({
        className: '',
        html: `<div style="width:32px;height:32px;border-radius:9999px;background:#0369A1;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.25)">${order}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
}

const baseIcon = L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:9999px;background:#0f172a;border:4px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.3)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
});

function FitBounds({ points }: { points: Array<[number, number]> }) {
    const map = useMap();

    React.useEffect(() => {
        const fitVisibleMap = () => {
            const container = map.getContainer();
            if (container.clientWidth === 0 || container.clientHeight === 0) return;

            map.invalidateSize();
            if (points.length === 1) map.setView(points[0], 14);
            if (points.length > 1) map.fitBounds(points, { padding: [40, 40] });
        };

        const observer = new ResizeObserver(fitVisibleMap);
        observer.observe(map.getContainer());
        fitVisibleMap();
        return () => observer.disconnect();
    }, [map, points]);

    return null;
}

export default function RouteMap({ stops, base, polyline, estimated = false, height = 380 }: Props) {
    const points = React.useMemo<Array<[number, number]>>(() => {
        const result: Array<[number, number]> = [];

        if (base) result.push([base.lat, base.lng]);
        for (const stop of stops) result.push([stop.lat, stop.lng]);
        result.push(...polyline);

        return result;
    }, [stops, base, polyline]);

    const center = points[0] ?? DEFAULT_CENTER;

    return (
        <div className="relative isolate z-0 w-full min-w-0 overflow-hidden rounded-xl border border-slate-300">
            <MapContainer center={center} zoom={12} scrollWheelZoom style={{ height }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {polyline.length > 1 && (
                    <Polyline
                        positions={polyline}
                        pathOptions={{ color: '#0369a1', weight: 5, opacity: 0.85, dashArray: estimated ? '8 8' : undefined }}
                    />
                )}
                {base && <Marker position={[base.lat, base.lng]} icon={baseIcon} />}
                {stops.map((stop) => (
                    <Marker
                        key={`${stop.order}-${stop.lat}-${stop.lng}`}
                        position={[stop.lat, stop.lng]}
                        icon={numberedIcon(stop.order)}
                    />
                ))}
                <FitBounds points={points} />
            </MapContainer>
        </div>
    );
}
