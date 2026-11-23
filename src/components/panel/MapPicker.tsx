import * as React from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER: [number, number] = [10.4709, -84.6453];

const pinIcon = L.divIcon({
    className: '',
    html: `<div style="width:34px;height:42px;display:flex;align-items:flex-start;justify-content:center;filter:drop-shadow(0 4px 6px rgba(0,0,0,.25))">
        <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 41C17 41 32 25.6 32 15.5C32 6.94 25.28 1 17 1C8.72 1 2 6.94 2 15.5C2 25.6 17 41 17 41Z" fill="#0369A1" stroke="white" stroke-width="2"/>
            <circle cx="17" cy="15.5" r="5.5" fill="white"/>
        </svg>
    </div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 41],
});

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
    useMapEvents({
        click(event) {
            onPick(event.latlng.lat, event.latlng.lng);
        },
    });
    return null;
}

function Recenter({ lat, lng }: { lat: number | null; lng: number | null }) {
    const map = useMap();

    React.useEffect(() => {
        if (lat != null && lng != null) {
            map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
        }
    }, [lat, lng, map]);

    return null;
}

interface Props {
    lat: number | null;
    lng: number | null;
    onChange?: (lat: number, lng: number) => void;
    readOnly?: boolean;
    height?: number;
}

export default function MapPicker({
    lat,
    lng,
    onChange,
    readOnly = false,
    height = 320,
}: Props) {
    const center: [number, number] = lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER;
    const [locating, setLocating] = React.useState(false);
    const [geoError, setGeoError] = React.useState('');

    function useMyLocation() {
        if (!onChange) return;

        if (!('geolocation' in navigator)) {
            setGeoError('Tu dispositivo no permite geolocalización.');
            return;
        }

        setLocating(true);
        setGeoError('');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocating(false);
                onChange(position.coords.latitude, position.coords.longitude);
            },
            () => {
                setLocating(false);
                setGeoError('No pudimos obtener tu ubicación. Marca el punto en el mapa.');
            },
            { enableHighAccuracy: true, timeout: 10_000 },
        );
    }

    return (
        <div className="relative isolate z-0">
            <div className="overflow-hidden rounded-xl border border-slate-300">
                <MapContainer
                    center={center}
                    zoom={lat != null && lng != null ? 16 : 13}
                    scrollWheelZoom={!readOnly}
                    style={{ height }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {!readOnly && onChange && <ClickHandler onPick={onChange} />}
                    {lat != null && lng != null && <Marker position={[lat, lng]} icon={pinIcon} />}
                    <Recenter lat={lat} lng={lng} />
                </MapContainer>
            </div>

            {!readOnly && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={useMyLocation}
                        disabled={locating}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                        📍 {locating ? 'Buscando…' : 'Usar mi ubicación'}
                    </button>
                    <span className="text-xs text-slate-500">
                        {lat != null && lng != null
                            ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                            : 'Toca el mapa para marcar la propiedad'}
                    </span>
                </div>
            )}

            {geoError && <p className="mt-1 text-xs font-medium text-red-600">{geoError}</p>}
        </div>
    );
}
