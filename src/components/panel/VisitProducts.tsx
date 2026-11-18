import * as React from 'react';
import { PRODUCTS, productInfo, type ProductKey } from '@/lib/products';

export interface ProductEntry {
    id: string;
    product: ProductKey;
    quantity: string;
}

interface Props {
    visitId: string;
    editable: boolean;
    initial: ProductEntry[];
}

export default function VisitProducts({ visitId, editable, initial }: Props) {
    const [entries, setEntries] = React.useState(initial);
    const [product, setProduct] = React.useState<ProductKey>('granulated_chlorine');
    const [quantity, setQuantity] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');

    async function update(body: unknown) {
        setBusy(true);
        setError('');
        try {
            const response = await fetch(`/api/panel/visits/${visitId}/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error ?? 'No se pudo guardar el producto.');
            setEntries(data.products);
            setQuantity('');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Error de conexión.');
        } finally {
            setBusy(false);
        }
    }

    const unit = productInfo(product).unit;
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">Productos aplicados</h2>
            <p className="mt-1 text-xs text-slate-500">Registra lo que se aplicó realmente a esta piscina.</p>

            {entries.length > 0 ? (
                <ul className="mt-4 space-y-2">
                    {entries.map((entry) => (
                        <li key={entry.id} className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-2 text-sm">
                            <span className="font-semibold text-slate-800">{productInfo(entry.product).label}</span>
                            <span className="flex shrink-0 items-center gap-3">
                                <strong className="text-slate-900">
                                    {Number(entry.quantity).toLocaleString('es-CR')} {productInfo(entry.product).unit}
                                </strong>
                                {editable && <button type="button" disabled={busy}
                                    onClick={() => {
                                        if (window.confirm('¿Quitar este producto del registro?')) {
                                            void update({ action: 'delete', productId: entry.id });
                                        }
                                    }}
                                    className="rounded-lg px-2 py-1 font-bold text-red-700 disabled:opacity-50">
                                    Quitar
                                </button>}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : <p className="mt-4 text-sm text-slate-500">Aún no hay productos registrados.</p>}

            {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
            {editable && <form className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_8rem_auto]"
                onSubmit={(event) => {
                    event.preventDefault();
                    void update({ action: 'add', product, quantity: Number(quantity) });
                }}>
                <label className="text-sm font-semibold text-slate-700">
                    Producto
                    <select value={product} onChange={(event) => setProduct(event.target.value as ProductKey)}
                        className="mt-1 block h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base">
                        {PRODUCTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                </label>
                <label className="text-sm font-semibold text-slate-700">
                    Cantidad ({unit})
                    <input type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" required
                        value={quantity} onChange={(event) => setQuantity(event.target.value)}
                        className="mt-1 block h-12 w-full rounded-xl border border-slate-300 px-3 text-base" />
                </label>
                <button type="submit" disabled={busy || !quantity}
                    className="h-12 self-end rounded-xl bg-sky-700 px-5 text-sm font-bold text-white disabled:opacity-50">
                    {busy ? 'Guardando…' : 'Agregar'}
                </button>
            </form>}
        </section>
    );
}
