import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { wczytajWejscia } from '../src/lib/wejscie.js';
import { policz } from '../src/metrics.mjs';
import { renderDashboard } from '../src/lib/dashboardHtml.js';

const KORZEN = path.join(import.meta.dirname, '..');
const CZYSTE = path.join(KORZEN, 'fixtures', 'demo-remonty');
const BRUDNE = path.join(KORZEN, 'fixtures', 'demo-brudny');

test('czysty zestaw danych przechodzi walidacje bez bledow', async () => {
  const { bledy, inwestycje, faktury, platnosci } = await wczytajWejscia(CZYSTE);
  assert.deepEqual(bledy, []);
  assert.equal(inwestycje.length, 8);
  assert.equal(faktury.length, 35);
  assert.equal(platnosci.length, 18);
});

test('brudny zestaw jest odrzucany, a kazdy blad ma wlasny komunikat', async () => {
  const { bledy } = await wczytajWejscia(BRUDNE);
  assert.ok(bledy.length >= 7, `oczekiwano wielu bledow, jest ${bledy.length}`);

  const razem = bledy.join('\n');
  assert.match(razem, /niejednoznaczne/, 'data z ukosnikami');
  assert.match(razem, /kropke i przecinek/, 'kwota z dwoma separatorami');
  assert.match(razem, /wystepuje dwa razy/, 'duplikat numeru faktury');
  assert.match(razem, /danymi wrazliwymi/, 'numer konta bankowego');
  assert.match(razem, /ktorej nie ma w inwestycje\.csv/, 'osierocone odwolanie');
  assert.match(razem, /nie jest jednym z/, 'zly status inwestycji');
  assert.match(razem, /wczesniejszy niz data wystawienia/, 'termin przed wystawieniem');
});

test('komunikat bledu wskazuje konkretny wiersz do poprawy', async () => {
  const { bledy } = await wczytajWejscia(BRUDNE);
  const oDacie = bledy.find((b) => b.includes('niejednoznaczne'));
  assert.match(oDacie, /Wiersz \d+/);
  assert.match(oDacie, /faktury\.csv/);
});

test('liczby z czystego zestawu zgadzaja sie z recznym wyliczeniem', async () => {
  const wejscia = await wczytajWejscia(CZYSTE);
  const m = policz(wejscia);

  assert.equal(m.podsumowanie.liczbaInwestycji, 8);
  assert.equal(m.podsumowanie.inwestycjeWTrakcie, 5);
  assert.equal(m.podsumowanie.inwestycjeWPrzygotowaniu, 1);
  assert.equal(m.podsumowanie.inwestycjeZakonczone, 2);

  // 300 000 + 280 000 (po czesciowej wplacie) + 410 000 + 240 000 + 340 000 + 260 000 + 420 000
  assert.equal(m.podsumowanie.naleznosci, 225000000);
  // FS/2026/12 (reszta 280 000) oraz FS/2026/11 (340 000)
  assert.equal(m.podsumowanie.naleznosciPrzeterminowane, 62000000);
  assert.equal(m.podsumowanie.liczbaPrzeterminowanychNaleznosci, 2);
});

test('percentyle opoznien per inwestor', async () => {
  const wejscia = await wczytajWejscia(CZYSTE);
  const m = policz(wejscia);
  const wg = Object.fromEntries(m.prognoza.historia.inwestorzy.map((i) => [i.inwestor, i]));

  assert.deepEqual(
    { n: wg['Riverpark Development Sp. z o.o.'].n, p50: wg['Riverpark Development Sp. z o.o.'].p50, p90: wg['Riverpark Development Sp. z o.o.'].p90 },
    { n: 4, p50: 22, p90: 26 },
  );
  // Inwestor z jedna domknieta faktura nie dostaje wymyslonych percentyli.
  const horizon = wg['Horizon Estates Sp. z o.o.'];
  assert.equal(horizon.n, 1);
  assert.equal(horizon.p50, null);
});

test('scenariusz pesymistyczny jest nie lepszy niz typowy', async () => {
  const wejscia = await wczytajWejscia(CZYSTE);
  const m = policz(wejscia);
  const { p50, p90 } = m.prognoza.scenariusze;
  assert.ok(p90.minimalneSaldo <= p50.minimalneSaldo);
  assert.ok(
    p90.tygodnie.filter((t) => t.ponizejZera).length >= p50.tygodnie.filter((t) => t.ponizejZera).length,
  );
});

test('te same wejscia daja bit-identyczny wynik', async () => {
  const a = policz(await wczytajWejscia(CZYSTE));
  const b = policz(await wczytajWejscia(CZYSTE));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('dashboard renderuje sie deterministycznie i nie siega do sieci', async () => {
  const m = policz(await wczytajWejscia(CZYSTE));
  const html = renderDashboard(m);
  assert.equal(html, renderDashboard(m));

  assert.doesNotMatch(html, /https?:\/\//, 'brak zewnetrznych adresow');
  assert.doesNotMatch(html, /<script/i, 'brak skryptow');
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /lang="pl"/);
});

test('dashboard nazywa rzeczy nieznane po imieniu, zamiast pokazywac zero', async () => {
  const m = policz(await wczytajWejscia(CZYSTE));
  const html = renderDashboard(m);
  assert.match(html, /N\/A/, 'brak danych oznaczony jako N/A');
  assert.match(html, /nie mowi, czy zaczac kolejna inwestycje/i, 'jawne zastrzezenie o decyzji');
  assert.match(html, /Horizon Estates/, 'inwestor z krotka historia jest wymieniony');
});
