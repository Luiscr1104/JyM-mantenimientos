import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    clarificationOption, findClarificationMatches, findPropertyMatches, lastWeek, requestedVisitDate,
    requestedWeek, spokenDate, spokenWeek, voiceConfirmation, weekContaining, type VoiceIntent,
} from '../src/lib/voice-assistant';
import { preferredSpanishVoice } from '../src/lib/voice-preferences';
import { resolveVoice } from '../src/lib/voice-settings';
import { splitSentences } from '../src/lib/piper-player';
import { reminderSchedule } from '../src/lib/personal-reminders';
import { monthForQuestion, pastVisitSelection, visitMinutes, weekForDuration } from '../src/lib/assistant-visit-read';

const properties = [
    { property: { alias: 'Casa Mariposa (Bill)' }, client: { name: 'Bill Smith' } },
    { property: { alias: 'Casa Olga' }, client: { name: 'Olga' } },
    { property: { alias: 'Piscina Olga Norte' }, client: { name: 'Olga' } },
];

test('busca alias y clientes sin distinguir acentos y no elige si hay dos propiedades', () => {
    assert.equal(findPropertyMatches(properties, 'casa de Bill').length, 1);
    assert.equal(findPropertyMatches(properties, 'casa mariposa bill').length, 1);
    assert.equal(findPropertyMatches(properties, 'Ólga').length, 2);
    assert.equal(findPropertyMatches(properties, 'casa olga').length, 1);
    assert.equal(findPropertyMatches(properties, 'ol').length, 0);
});

test('semana pasada es lunes a domingo en Costa Rica, incluso al cambiar de año', () => {
    assert.deepEqual(lastWeek('2026-11-24'), { from: '2026-11-16', to: '2026-11-22' });
    assert.deepEqual(lastWeek('2026-11-22'), { from: '2026-11-09', to: '2026-11-15' });
    assert.deepEqual(lastWeek('2027-01-04'), { from: '2026-12-28', to: '2027-01-03' });
});

test('consulta cloro de esta semana, hace varias semanas y de una fecha específica', () => {
    const intent: VoiceIntent = {
        action: 'chlorine_history', target: 'Adolfo', period: 'this_week',
        workType: 'routine', weeksAgo: 0, anchorDate: '',
    };
    assert.deepEqual(requestedWeek(intent, '2026-11-24'), { from: '2026-11-23', to: '2026-11-29' });
    assert.deepEqual(requestedWeek({ ...intent, period: 'weeks_ago', weeksAgo: 3 }, '2026-11-24'),
        { from: '2026-11-02', to: '2026-11-08' });
    assert.deepEqual(requestedWeek({ ...intent, period: 'week_of', anchorDate: '2025-10-12' }, '2026-11-24'),
        { from: '2025-10-06', to: '2025-10-12' });
    assert.equal(requestedWeek({ ...intent, period: 'week_of', anchorDate: '2026-02-30' }, '2026-11-24'), null);
    assert.equal(requestedWeek({ ...intent, period: 'week_of', anchorDate: '2026-12-03' }, '2026-11-24'), null);
    assert.equal(requestedWeek({ ...intent, period: 'weeks_ago', weeksAgo: -1 }, '2026-11-24'), null);
    assert.deepEqual(weekContaining('2027-01-01'), { from: '2026-12-28', to: '2027-01-03' });
});

test('las fechas habladas omiten el año salvo cuando hace falta', () => {
    assert.equal(spokenDate('2026-11-24', '2026-11-24'), 'martes 24 de noviembre');
    assert.equal(spokenDate('2025-10-12', '2026-11-24'), 'domingo 12 de octubre de 2025');
    assert.equal(spokenWeek('2026-11-16', '2026-11-22', '2026-11-24'),
        'del lunes 16 al domingo 22 de noviembre');
    assert.equal(spokenWeek('2026-12-28', '2027-01-03', '2026-11-24'),
        'del lunes 28 de diciembre al domingo 3 de enero de 2027');
});

test('una aclaración solo permite escoger entre las propiedades candidatas', () => {
    const candidates = [
        { property: { alias: 'Casa Adolfo Pérez' }, client: { name: 'Adolfo Pérez' } },
        { property: { alias: 'Casa Adolfo Vargas' }, client: { name: 'Adolfo Vargas' } },
    ];
    assert.equal(findClarificationMatches(candidates, 'Me refiero a Adolfo Pérez')[0], candidates[0]);
    assert.equal(findClarificationMatches(candidates, 'Adolfo').length, 2);
    assert.equal(findClarificationMatches(candidates, 'Olga').length, 0);
    assert.equal(clarificationOption('la opción dos'), 2);
    assert.equal(clarificationOption('la primera'), 1);
    assert.equal(clarificationOption('el número 5'), 5);
    assert.equal(clarificationOption('Adolfo dos'), null);
    assert.equal(findClarificationMatches([
        { property: { alias: 'Casa Olga' }, client: { name: 'Olga' } },
        { property: { alias: 'Piscina Olga Norte' }, client: { name: 'Olga' } },
    ], 'la casa Olga').length, 1);
});

test('visitas futuras: fechas relativas, días y calendario de Costa Rica sin aceptar pasado', () => {
    const today = '2026-11-24'; // martes
    assert.deepEqual(requestedVisitDate('visita para hoy de Olga', today), { date: today });
    assert.deepEqual(requestedVisitDate('visita para mañana de Olga', today), { date: '2026-11-25' });
    assert.deepEqual(requestedVisitDate('visita para pasado mañana de Olga', today), { date: '2026-11-26' });
    assert.deepEqual(requestedVisitDate('visita el viernes de Olga', today), { date: '2026-11-27' });
    assert.deepEqual(requestedVisitDate('visita el 3 de diciembre de Olga', today), { date: '2026-12-03' });
    assert.deepEqual(requestedVisitDate('visita en 5 días de Olga', today), { date: '2026-11-29' });
    assert.deepEqual(requestedVisitDate('visita el viernes 27 de noviembre de Olga', today), { date: '2026-11-27' });
    assert.deepEqual(requestedVisitDate('visita el martes de Olga', today), { reason: 'ambiguous' });
    assert.deepEqual(requestedVisitDate('visita hoy y mañana de Olga', today), { reason: 'ambiguous' });
    assert.deepEqual(requestedVisitDate('visita el 1 de noviembre de Olga', today), { reason: 'year' });
    assert.deepEqual(requestedVisitDate('visita el 31 de febrero de 2027 de Olga', today), { reason: 'invalid' });
    assert.deepEqual(requestedVisitDate('visita el 3 de noviembre de 2026 de Olga', today), { reason: 'past' });
    assert.deepEqual(requestedVisitDate('visita mañana por la mañana de Olga', today), { date: '2026-11-25' });
    assert.deepEqual(requestedVisitDate('visita en la mañana de Olga', today), { reason: 'missing' });
    assert.deepEqual(requestedVisitDate('visita el 3 de enero de 2027 de Olga', '2026-12-30'),
        { date: '2027-01-03' });
});

test('selecciona voz masculina española conocida y no atribuye género a una voz desconocida', () => {
    const voices = [
        { name: 'Mónica', lang: 'es-ES' }, { name: 'Jorge', lang: 'es-ES' },
        { name: 'Diego', lang: 'es-AR' },
    ];
    assert.equal(preferredSpanishVoice(voices), voices[1]);
    assert.equal(preferredSpanishVoice([voices[0]]), undefined);
});

test('respeta la voz guardada y no cae en Mónica si ya no existe', () => {
    const voices = [
        { voiceURI: 'com.apple.voice.compact.es-ES.Monica', name: 'Mónica', lang: 'es-ES' },
        { voiceURI: 'com.apple.voice.enhanced.es-ES.Jorge', name: 'Jorge', lang: 'es-ES' },
    ];
    const saved = { choice: 'device' as const, uri: 'com.apple.voice.enhanced.es-ES.Jorge', name: 'Jorge', lang: 'es-ES' };
    assert.equal(resolveVoice(voices, saved), voices[1]);
    // iOS puede cambiar la URI entre sesiones: el nombre sigue sirviendo.
    assert.equal(resolveVoice(voices, { ...saved, uri: 'jorge-renombrado' }), voices[1]);
    // Una preferencia explícita que desapareció no debe sustituirse por Mónica.
    assert.equal(resolveVoice(voices, { ...saved, uri: 'otra', name: 'Desconocida' }), undefined);
    // Sin preferencia guardada, se elige la masculina conocida.
    assert.equal(resolveVoice(voices, { choice: 'device', uri: '', name: '', lang: '' }), voices[1]);
});

test('recordatorios sin hora se ven hoy; con hora se programan solo si no pasó en Costa Rica', () => {
    const now = new Date('2026-11-24T16:00:00Z'); // 10 a.m. en Costa Rica
    assert.deepEqual(reminderSchedule('recuérdame comprar concentrado para Negro', '2026-11-24', now),
        { dueDate: '2026-11-24', dueAt: null });
    assert.deepEqual(reminderSchedule('recuérdame el llavero de Olga mañana a las 4 de la tarde',
        '2026-11-24', now), {
        dueDate: '2026-11-25', dueAt: new Date('2026-11-25T22:00:00Z'),
    });
    assert.match(reminderSchedule('recuérdame comprar concentrado a las 4',
        '2026-11-24', now).error ?? '', /Aclara la hora/);
    assert.match(reminderSchedule('recuérdame comprar concentrado a las 8 de la mañana',
        '2026-11-24', now).error ?? '', /ya pasó/);
});

test('inicio y cierre por voz exigen confirmación y cierre comprueba bomba y salida', () => {
    const server = readFileSync('src/server/voice-assistant.ts', 'utf8');
    const work = readFileSync('src/server/visit-work.ts', 'utf8');
    const reminders = readFileSync('src/server/personal-reminders.ts', 'utf8');
    assert.match(server, /action: 'start_visit'/);
    assert.match(server, /nextChecklistStep/);
    assert.match(server, /voiceConfirmation\(confirmation\) !== 'confirm'/);
    assert.match(server, /completeVisitByVoice\(row\.visit\.id, userId, preview\.checkedKeys/);
    assert.match(work, /getCompletionIssue\(checklist, current\.pendingReason/);
    assert.match(work, /pumpStartedAt && !current\.pumpStoppedAt/);
    assert.match(reminders, /eq\(personalReminders\.userId, userId\)/);
});

test('consultas de visitas resuelven fechas pasadas sin inventar el año', () => {
    assert.deepEqual(pastVisitSelection('visita de hoy de Olga', '2026-11-24'),
        { mode: 'date', date: '2026-11-24' });
    assert.deepEqual(pastVisitSelection('visita de Olga del 20 de noviembre', '2026-11-24'),
        { mode: 'date', date: '2026-11-20' });
    assert.deepEqual(pastVisitSelection('visita anterior de Olga', '2026-11-24'), { mode: 'previous' });
    assert.deepEqual(pastVisitSelection('visita del 2 de diciembre', '2026-11-24'), { mode: 'ambiguous' });
    assert.deepEqual(pastVisitSelection('visita del 31 de febrero de 2026', '2026-11-24'), { mode: 'ambiguous' });
    assert.deepEqual(pastVisitSelection('última visita de Bill', '2026-11-24'), { mode: 'latest' });
});

test('cloro mensual y horas semanales respetan cambios de año y datos incompletos', () => {
    assert.deepEqual(monthForQuestion('cloro este mes', '2027-01-04'),
        { month: '2027-01', from: '2027-01-01', to: '2027-01-04' });
    assert.deepEqual(monthForQuestion('cloro el mes pasado', '2027-01-04'),
        { month: '2026-12', from: '2026-12-01', to: '2026-12-31' });
    assert.deepEqual(monthForQuestion('cloro el mes pasado', '2027-03-31'),
        { month: '2027-02', from: '2027-02-01', to: '2027-02-28' });
    assert.equal(monthForQuestion('cloro de octubre', '2027-01-04'), null);
    assert.deepEqual(weekForDuration('tiempo trabajado esta semana', '2027-01-04'),
        { from: '2027-01-04', to: '2027-01-10' });
    assert.deepEqual(weekForDuration('tiempo trabajado la semana pasada', '2027-01-04'),
        { from: '2026-12-28', to: '2027-01-03' });
    assert.equal(visitMinutes(new Date('2026-11-24T16:00Z'), new Date('2026-11-24T17:25Z')), 85);
    assert.equal(visitMinutes(new Date('2026-11-24T17:25Z'), new Date('2026-11-24T16:00Z')), null);
    assert.equal(visitMinutes(null, new Date()), null);
});

test('las seis consultas de lectura preservan propiedad y solo leen registros', () => {
    const server = readFileSync('src/server/voice-assistant.ts', 'utf8');
    const queries = readFileSync('src/server/assistant-visit-queries.ts', 'utf8');
    const ui = readFileSync('src/components/panel/VoiceConversation.tsx', 'utf8');
    for (const action of ['visit_summary', 'today_briefing', 'property_pending',
        'visit_compare', 'chlorine_month', 'visit_duration']) assert.match(server, new RegExp(action));
    assert.match(server, /userId, propertyId: row\.property\.id, date: result\.date/);
    assert.match(server, /continueRead\(text, userId, contextToken\.slice\(2\)\)/);
    assert.match(server, /continueClarification\(text, userId, contextToken\)/);
    assert.match(server, /selection\.mode === 'previous' && action !== 'visit_compare'/);
    assert.match(ui, /contextRef\.current = answer\.contextToken \?\? null/);
    assert.match(queries, /eq\(personalReminders\.userId, userId\)/);
    assert.match(queries, /productSummary\(products\)/);
    assert.match(queries, /visitMinutes\(startedAt, leftAt\)/);
    assert.doesNotMatch(queries, /\.insert\(|\.update\(|\.delete\(/);
});

test('la confirmación hablada exige una frase inequívoca', () => {
    assert.equal(voiceConfirmation('Sí, confirmo.'), 'confirm');
    assert.equal(voiceConfirmation('Confirmo la visita'), 'confirm');
    assert.equal(voiceConfirmation('sí'), 'unknown');
    assert.equal(voiceConfirmation('ok'), 'unknown');
    assert.equal(voiceConfirmation('No, cancelar'), 'unknown');
    assert.equal(voiceConfirmation('No cancelar'), 'unknown');
    assert.equal(voiceConfirmation('Cancelar'), 'cancel');
    assert.equal(voiceConfirmation('sí confirmo la bomba'), 'unknown');
});

test('la voz propone antes de crear; el servidor también valida la confirmación', () => {
    const server = readFileSync('src/server/voice-assistant.ts', 'utf8');
    const ui = readFileSync('src/components/panel/VoiceConversation.tsx', 'utf8');
    const device = readFileSync('src/lib/device-voice.ts', 'utf8');
    assert.match(server, /return \{\s*kind: 'preview'/);
    assert.match(server, /voiceConfirmation\(confirmation\) !== 'confirm'/);
    assert.match(server, /await createVisit\(/);
    assert.match(server, /requestedVisitDate\(text, date\)/);
    assert.match(server, /preview\.date < getToday\(\)/);
    assert.match(server, /clarificationOption\(text\)/);
    assert.match(server, /requestedWeek\(intent, date\)/);
    assert.match(server, /contextToken\) return continueClarification/);
    assert.match(server, /property\.id === id/);
    assert.match(server, /signedToken\(\{ \.\.\.context, candidateIds:/);
    assert.doesNotMatch(server, /listPropertyProducts\(/);
    assert.match(ui, /previewHeardRef\.current/);
    assert.match(device, /synth\.speak\(utterance\)/);
    assert.match(device, /utterance\.onend/);
    assert.match(ui, /piperPlayer\.speak\(/);
    assert.match(ui, /\/panel\/ajustes#voz/);
    assert.match(ui, /startRecording\(false, true\)/);
    assert.match(ui, /contextRef\.current = answer\.contextToken/);
    assert.match(ui, /postJson\('\/api\/panel\/assistant\/confirm', \{ token, confirmation \}\)/);
    assert.doesNotMatch(ui, /<textarea|answer\.message\}<\/p>/);
    assert.match(ui, /MediaRecorder\.isTypeSupported/);
});

test('divide la respuesta en frases para empezar a hablar antes', () => {
    assert.deepEqual(splitSentences('Hola. ¿Cómo estás? Bien'), ['Hola.', '¿Cómo estás?', 'Bien']);
    assert.deepEqual(splitSentences('   '), []);
    const long = splitSentences('palabra '.repeat(80));
    assert.ok(long.length > 1);
    assert.ok(long.every((chunk) => chunk.length <= 220));
});

test('la voz Piper se cachea en el teléfono y usa recursos locales', () => {
    const worker = readFileSync('src/lib/piper-voice.worker.ts', 'utf8');
    const player = readFileSync('src/lib/piper-player.ts', 'utf8');
    assert.match(worker, /PIPER_CACHE/);
    assert.match(worker, /caches\.open/);
    assert.match(worker, /wasmPaths = assetBase/);
    assert.match(worker, /chain\.then/);
    assert.match(worker, /'--input', JSON\.stringify\(\[\{ text \}\]\)/);
    assert.match(player, /splitSentences/);
    assert.match(player, /markPiperReady/);
});
