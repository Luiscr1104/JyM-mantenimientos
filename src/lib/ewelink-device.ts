// Lista explícita: no exponer apikey, devicekey, Wi-Fi ni parámetros desconocidos.
const TELEMETRY_KEYS = [
    'switch', 'power', 'current', 'voltage', 'dayKwh', 'monthKwh', 'totalKwh',
    'actPow', 'actCur', 'actVol', 'phase_x_p', 'phase_x_c', 'phase_x_v',
    'hundredDaysKwhData', 'oneKwhData', 'energyHistory', 'kwhData', 'getHoursKwh',
] as const;

export function safeTelemetry(value: unknown): Record<string, string | number | boolean> {
    if (!value || typeof value !== 'object') return {};
    const params = value as Record<string, unknown>;
    const result: Record<string, string | number | boolean> = {};
    for (const key of TELEMETRY_KEYS) {
        const field = params[key];
        if (typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean') {
            result[key] = String(field).length <= 64 ? field : 'Disponible (dato codificado extenso)';
        } else if (field != null && ['hundredDaysKwhData', 'energyHistory', 'getHoursKwh'].includes(key)) {
            result[key] = 'Disponible (estructura no mostrada)';
        }
    }
    if (Array.isArray(params.switches)) {
        const channels = params.switches.slice(0, 4).flatMap((row) => {
            if (!row || typeof row !== 'object') return [];
            const { outlet, switch: state } = row as Record<string, unknown>;
            return Number.isInteger(outlet) && (state === 'on' || state === 'off')
                ? [`${outlet}: ${state}`] : [];
        });
        if (channels.length) result.switches = channels.join(', ');
    }
    return result;
}

export interface EwelinkThing {
    itemType: number;
    itemData?: {
        deviceid?: string; name?: string; online?: boolean; productModel?: string;
        brandName?: string; extra?: { uiid?: number }; params?: unknown;
    };
}

export function safeDevice(thing: EwelinkThing) {
    const device = thing.itemData;
    if (!device || ![1, 2].includes(thing.itemType) || !device.deviceid) return null;
    return {
        id: device.deviceid,
        name: device.name ?? 'Sin nombre',
        model: device.productModel ?? null,
        brand: device.brandName ?? null,
        uiid: device.extra?.uiid ?? null,
        online: device.online === true,
        telemetry: safeTelemetry(device.params),
    };
}
