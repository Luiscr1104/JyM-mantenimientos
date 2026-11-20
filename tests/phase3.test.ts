import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { offlineSyncSchema } from '../src/lib/offline-visit';
import { emptyChecklist, getCompletionIssue } from '../src/lib/visit-work';

const valid = () => ({
    syncId: '208663c1-b445-413a-bd39-79335946319d',
    visitId: 'a8aff1e6-7759-494c-9423-6a6a3fbd2e26',
    expectedUpdatedAt: '2026-11-19T12:00:00.000Z',
    startedAt: '2026-11-19T12:01:00.000Z',
    pumpStartedAt: '2026-11-19T12:02:00.000Z',
    pumpStoppedAt: '2026-11-19T12:30:00.000Z',
    completedAt: '2026-11-19T13:00:00.000Z',
    work: {
        workTypes: ['routine'],
        checklist: emptyChecklist(),
        notes: '',
        pendingReason: 'Faltó una tarea por falta de acceso.',
    },
    products: [{ product: 'granulated_chlorine', quantity: 20 }],
    existingProducts: [],
});

test('los cierres offline exigen estructura y productos válidos', () => {
    assert.equal(offlineSyncSchema.safeParse(valid()).success, true);
    assert.equal(offlineSyncSchema.safeParse({ ...valid(), syncId: 'no-id' }).success, false);
    assert.equal(offlineSyncSchema.safeParse({ ...valid(), products: [{ product: 'caustic_base', quantity: -3 }] }).success, false);
});

test('el protocolo de salida se mantiene antes de sincronizar', () => {
    const checklist = emptyChecklist();
    assert.match(getCompletionIssue(checklist, valid().work.pendingReason, false, ['routine'])!, /tres pasos/);
    checklist.exitEquipment = true;
    checklist.exitTools = true;
    checklist.exitAccess = true;
    assert.match(getCompletionIssue(checklist, valid().work.pendingReason, true, ['routine'])!, /bomba/);
    assert.equal(getCompletionIssue(checklist, valid().work.pendingReason, false, ['routine']), null);
});

test('el manifiesto de la PWA instalada abre el panel', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
    assert.equal(manifest.start_url, '/panel');
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.icons.some((icon: { src: string }) => icon.src === '/logoJyM.png'));
});

test('las tablas nuevas y el historial de eventos mantienen RLS', () => {
    const sql = readFileSync('drizzle/0007_wandering_black_tarantula.sql', 'utf8') +
        readFileSync('drizzle/0008_typical_firelord.sql', 'utf8');
    for (const table of ['push_subscriptions', 'reminder_deliveries', 'offline_visit_syncs', 'visit_events']) {
        assert.ok(sql.includes(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`));
    }
});
