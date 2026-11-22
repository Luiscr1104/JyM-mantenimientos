import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { mayReceiveNotifications } from '../src/lib/notification-policy';

test('Luis (dueño) y la cuenta técnica seleccionada pueden suscribirse independientemente', () => {
    assert.equal(mayReceiveNotifications('luis', 'owner', 'jose'), true);
    assert.equal(mayReceiveNotifications('jose', 'tech', 'jose'), true);
    assert.equal(mayReceiveNotifications('otro', 'tech', 'jose'), false);
    assert.equal(mayReceiveNotifications('jose', 'tech', null), false);
    assert.equal(mayReceiveNotifications('luis', 'owner', null), true);
});

test('los envíos tienen registro independiente por dispositivo y aislamiento RLS', () => {
    const migration = readFileSync('drizzle/0009_large_mathemanic.sql', 'utf8');
    assert.match(migration, /"kind","target_id","due_at","subscription_id"/);
    assert.match(migration, /"reminder_device_deliveries" ENABLE ROW LEVEL SECURITY/);
    const sender = readFileSync('src/server/push-reminders.ts', 'utf8');
    assert.match(sender, /eq\(reminderDeviceDeliveries\.subscriptionId, subscriptionId\)/);
    assert.match(sender, /eq\(reminderDeviceDeliveries\.status, 'retry'\)/);
    assert.match(sender, /status: 'accepted'/);
    assert.doesNotMatch(sender, /delete\(pushSubscriptions\)\.where\(ne\(pushSubscriptions\.userId/);
});

test('la identidad nueva incluye iconos reales para app, Safari y notificaciones', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
    for (const size of [192, 512]) {
        assert.ok(manifest.icons.some((icon: { src: string; sizes: string }) =>
            icon.src === `/brand-icon-${size}.png` && icon.sizes === `${size}x${size}`));
    }
    for (const size of [64, 180, 192, 512]) {
        const png = readFileSync(`public/brand-icon-${size}.png`);
        assert.equal(png.readUInt32BE(16), size);
        assert.equal(png.readUInt32BE(20), size);
    }
    assert.match(readFileSync('public/sw.js', 'utf8'), /badge: '\/brand-badge\.png'/);
    assert.match(readFileSync('src/layouts/PanelLayout.astro', 'utf8'), /apple-touch-icon" href="\/brand-icon-180\.png"/);
});
