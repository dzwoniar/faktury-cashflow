// metrics.mjs — deterministyczne liczby z zatwierdzonych wejsc.
// Uzycie: node src/metrics.mjs <katalog-wejsc>
//
// Wynik NIE zawiera znacznika czasu ani niczego, co zmienia sie miedzy uruchomieniami.
// Dwa przebiegi na tych samych wejsciach daja bit-identyczny metrics.json — to jest warunek
// tego, zeby liczbie z raportu mozna bylo ufac i zeby dalo sie ja odtworzyc za pol roku.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { wczytajWejscia } from './lib/wejscie.js';
import { zbudujStanFaktur, zbudujStanInwestycji, podsumowanie } from './lib/faktury.js';
import { historiaOpoznien, projekcjaPelna } from './lib/cashflow.js';
import { formatPLN } from './lib/liczby.js';

export function policz({ konfiguracja, inwestycje, faktury, platnosci }) {
  const stanFaktur = zbudujStanFaktur(faktury, platnosci, konfiguracja.naDzien);
  const stanInwestycji = zbudujStanInwestycji(inwestycje, stanFaktur);
  const historia = historiaOpoznien(stanFaktur, stanInwestycji, konfiguracja.minHistoriiDoPrognozy);
  const prognoza = projekcjaPelna({ stanFaktur, stanInwestycji, historia, konfiguracja });

  return {
    schema_version: '1.0',
    firma: konfiguracja.firma,
    konfiguracja: {
      naDzien: konfiguracja.naDzien,
      saldoPoczatkowe: konfiguracja.saldoPoczatkowe,
      minimalnaPoduszka: konfiguracja.minimalnaPoduszka,
      horyzontTygodni: konfiguracja.horyzontTygodni,
      minHistoriiDoPrognozy: konfiguracja.minHistoriiDoPrognozy,
    },
    podsumowanie: podsumowanie(stanFaktur, stanInwestycji, konfiguracja),
    inwestycje: stanInwestycji,
    faktury: stanFaktur,
    prognoza,
  };
}

async function main() {
  const katalog = process.argv[2];
  if (!katalog) {
    console.error('Podaj katalog wejsc, np. `node src/metrics.mjs fixtures/demo-remonty`.');
    process.exitCode = 1;
    return;
  }

  const wejscia = await wczytajWejscia(katalog);
  if (wejscia.bledy.length > 0) {
    console.error(`NEEDS_REVIEW — ${wejscia.bledy.length} blad(ow) w wejsciach. Nie licze.`);
    wejscia.bledy.forEach((b) => console.error(`  x ${b}`));
    console.error('\nUruchom `node src/validate.mjs ' + katalog + '` po pelny opis.');
    process.exitCode = 1;
    return;
  }

  const metryki = policz(wejscia);
  const katalogWyjsciowy = path.join('output', path.basename(katalog));
  await mkdir(katalogWyjsciowy, { recursive: true });
  const plik = path.join(katalogWyjsciowy, 'metrics.json');
  await writeFile(plik, JSON.stringify(metryki, null, 2) + '\n', 'utf8');

  const p = metryki.podsumowanie;
  console.log(`Zapisano ${plik}`);
  console.log(
    `Inwestycji: ${p.liczbaInwestycji} (w trakcie ${p.inwestycjeWTrakcie}, ` +
      `w przygotowaniu ${p.inwestycjeWPrzygotowaniu}, zakonczonych ${p.inwestycjeZakonczone}).`,
  );
  console.log(
    `Naleznosci otwarte: ${formatPLN(p.naleznosci)}, w tym przeterminowane ` +
      `${formatPLN(p.naleznosciPrzeterminowane)} (${p.liczbaPrzeterminowanychNaleznosci} faktur).`,
  );
  console.log(`Zobowiazania otwarte: ${formatPLN(p.zobowiazania)}.`);
  console.log(`Nastepny krok: node src/render.mjs ${katalogWyjsciowy}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('metrics.mjs')) {
  main();
}
