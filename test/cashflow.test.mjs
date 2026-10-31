import test from 'node:test';
import assert from 'node:assert/strict';
import { historiaOpoznien, projekcja, projekcjaPelna } from '../src/lib/cashflow.js';
import { zbudujStanFaktur, zbudujStanInwestycji } from '../src/lib/faktury.js';
import { parseData, formatData } from '../src/lib/daty.js';

const NA_DZIEN = parseData('2026-08-11');

const KONFIGURACJA = {
  firma: 'Test',
  naDzien: NA_DZIEN,
  saldoPoczatkowe: 10000000, // 100 000,00 zl
  horyzontTygodni: 8,
  minHistoriiDoPrognozy: 3,
  minimalnaPoduszka: 2000000, // 20 000,00 zl
};

function inwestycja(id, inwestor) {
  return {
    id,
    nazwa: id,
    inwestor,
    etap: 'x',
    dataStartu: parseData('2026-01-01'),
    wartoscKontraktu: 100000000,
    kaucjaProc: 5,
    kaucja: 5000000,
    status: 'w_trakcie',
  };
}

function fakturaSprzedaz(id, idInwestycji, termin, kwota) {
  return {
    id,
    idInwestycji,
    typ: 'sprzedaz',
    kontrahent: 'Inwestor',
    dataWystawienia: parseData('2026-01-01'),
    terminPlatnosci: parseData(termin),
    kwotaBrutto: kwota,
  };
}

// Cztery domkniete faktury inwestora A, kazda oplacona 10 dni po terminie.
function historiaDlaA() {
  const faktury = [];
  const platnosci = [];
  const terminy = ['2026-03-10', '2026-04-10', '2026-05-10', '2026-06-10'];
  terminy.forEach((termin, i) => {
    faktury.push(fakturaSprzedaz(`H${i}`, 'I-A', termin, 1000000));
    const dzien = parseData(termin) + 10;
    platnosci.push({ id: `P${i}`, idFaktury: `H${i}`, data: dzien, kwota: 1000000 });
  });
  return { faktury, platnosci };
}

test('historia opoznien liczona jest tylko z faktur domknietych do zera', () => {
  const { faktury, platnosci } = historiaDlaA();
  // Faktura otwarta, mimo ze po terminie, nie wchodzi do historii.
  faktury.push(fakturaSprzedaz('OTWARTA', 'I-A', '2026-07-01', 5000000));

  const stanFaktur = zbudujStanFaktur(faktury, platnosci, NA_DZIEN);
  const stanInwestycji = zbudujStanInwestycji([inwestycja('I-A', 'Alfa')], stanFaktur);
  const historia = historiaOpoznien(stanFaktur, stanInwestycji, 3);

  const alfa = historia.inwestorzy.find((i) => i.inwestor === 'Alfa');
  assert.equal(alfa.n, 4);
  assert.equal(alfa.p50, 10);
  assert.equal(alfa.p90, 10);
});

test('zbyt krotka historia daje percentyle null, a nie zero opoznienia', () => {
  const faktury = [fakturaSprzedaz('H0', 'I-B', '2026-03-10', 1000000)];
  const platnosci = [{ id: 'P0', idFaktury: 'H0', data: parseData('2026-03-20'), kwota: 1000000 }];
  const stanFaktur = zbudujStanFaktur(faktury, platnosci, NA_DZIEN);
  const stanInwestycji = zbudujStanInwestycji([inwestycja('I-B', 'Beta')], stanFaktur);
  const historia = historiaOpoznien(stanFaktur, stanInwestycji, 3);

  const beta = historia.inwestorzy.find((i) => i.inwestor === 'Beta');
  assert.equal(beta.n, 1);
  assert.equal(beta.wystarczajacaHistoria, false);
  assert.equal(beta.p50, null);
  assert.equal(beta.p75, null);
  assert.equal(beta.p90, null);
});

test('inwestor bez ani jednej domknietej faktury trafia na liste "bez historii"', () => {
  const faktury = [fakturaSprzedaz('OTWARTA', 'I-C', '2026-09-01', 1000000)];
  const stanFaktur = zbudujStanFaktur(faktury, [], NA_DZIEN);
  const stanInwestycji = zbudujStanInwestycji([inwestycja('I-C', 'Gamma')], stanFaktur);
  const historia = historiaOpoznien(stanFaktur, stanInwestycji, 3);
  assert.deepEqual(historia.bezHistorii, ['Gamma']);
});

test('wplyw ladowany jest w tygodniu terminu powiekszonego o opoznienie z historii', () => {
  const { faktury, platnosci } = historiaDlaA();
  // Termin 2026-09-01 (wtorek) + 10 dni = 2026-09-11 (piatek), tydzien od poniedzialku 2026-09-07.
  faktury.push(fakturaSprzedaz('PRZYSZLA', 'I-A', '2026-09-01', 3000000));

  const stanFaktur = zbudujStanFaktur(faktury, platnosci, NA_DZIEN);
  const stanInwestycji = zbudujStanInwestycji([inwestycja('I-A', 'Alfa')], stanFaktur);
  const historia = historiaOpoznien(stanFaktur, stanInwestycji, 3);
  const wynik = projekcja({ stanFaktur, stanInwestycji, historia, konfiguracja: KONFIGURACJA, kluczScenariusza: 'p50' });

  const zWplywem = wynik.tygodnie.filter((t) => t.wplywy > 0);
  assert.equal(zWplywem.length, 1);
  assert.equal(formatData(zWplywem[0].poczatek), '2026-09-07');
  assert.equal(zWplywem[0].wplywy, 3000000);
});

test('faktura juz przeterminowana nie wplywa wstecz, najwczesniej w dniu raportu', () => {
  const { faktury, platnosci } = historiaDlaA();
  // Termin dawno minal; termin + 10 dni tez jest w przeszlosci.
  faktury.push(fakturaSprzedaz('ZALEGLA', 'I-A', '2026-06-01', 4000000));

  const stanFaktur = zbudujStanFaktur(faktury, platnosci, NA_DZIEN);
  const stanInwestycji = zbudujStanInwestycji([inwestycja('I-A', 'Alfa')], stanFaktur);
  const historia = historiaOpoznien(stanFaktur, stanInwestycji, 3);
  const wynik = projekcja({ stanFaktur, stanInwestycji, historia, konfiguracja: KONFIGURACJA, kluczScenariusza: 'p50' });

  const zWplywem = wynik.tygodnie.filter((t) => t.wplywy > 0);
  assert.equal(zWplywem.length, 1);
  // 2026-08-11 to wtorek; tydzien zaczyna sie 2026-08-10.
  assert.equal(formatData(zWplywem[0].poczatek), '2026-08-10');
});

test('naleznosc spoza horyzontu jest raportowana osobno, nie gubi sie', () => {
  const { faktury, platnosci } = historiaDlaA();
  faktury.push(fakturaSprzedaz('DALEKA', 'I-A', '2027-01-01', 7000000));

  const stanFaktur = zbudujStanFaktur(faktury, platnosci, NA_DZIEN);
  const stanInwestycji = zbudujStanInwestycji([inwestycja('I-A', 'Alfa')], stanFaktur);
  const historia = historiaOpoznien(stanFaktur, stanInwestycji, 3);
  const wynik = projekcja({ stanFaktur, stanInwestycji, historia, konfiguracja: KONFIGURACJA, kluczScenariusza: 'p50' });

  assert.equal(wynik.poHoryzoncieWplywy, 7000000);
  assert.equal(wynik.tygodnie.every((t) => t.wplywy === 0), true);
});

test('saldo narasta tydzien po tygodniu i wychwytuje zejscie ponizej zera', () => {
  const zakup = {
    id: 'FZ/1',
    idInwestycji: 'I-A',
    typ: 'zakup',
    kontrahent: 'Podwykonawca',
    dataWystawienia: parseData('2026-08-01'),
    terminPlatnosci: parseData('2026-08-18'),
    kwotaBrutto: 15000000, // 150 000,00 zl przy saldzie 100 000,00 zl
  };
  const { faktury, platnosci } = historiaDlaA();
  faktury.push(zakup);

  const stanFaktur = zbudujStanFaktur(faktury, platnosci, NA_DZIEN);
  const stanInwestycji = zbudujStanInwestycji([inwestycja('I-A', 'Alfa')], stanFaktur);
  const historia = historiaOpoznien(stanFaktur, stanInwestycji, 3);
  const wynik = projekcja({ stanFaktur, stanInwestycji, historia, konfiguracja: KONFIGURACJA, kluczScenariusza: 'p50' });

  assert.equal(wynik.minimalneSaldo, -5000000);
  assert.equal(formatData(wynik.pierwszyTydzienPonizejZera), '2026-08-17');
  // Poduszka zostaje przebita w tym samym tygodniu co zero.
  assert.equal(formatData(wynik.pierwszyTydzienPonizejPoduszki), '2026-08-17');
});

test('projekcja pelna zwraca trzy scenariusze, jawne zalozenia i ostrzezenia', () => {
  const { faktury, platnosci } = historiaDlaA();
  faktury.push(fakturaSprzedaz('KROTKA', 'I-B', '2026-09-01', 2000000));

  const stanFaktur = zbudujStanFaktur(faktury, platnosci, NA_DZIEN);
  const stanInwestycji = zbudujStanInwestycji(
    [inwestycja('I-A', 'Alfa'), inwestycja('I-B', 'Beta')],
    stanFaktur,
  );
  const historia = historiaOpoznien(stanFaktur, stanInwestycji, 3);
  const pelna = projekcjaPelna({ stanFaktur, stanInwestycji, historia, konfiguracja: KONFIGURACJA });

  assert.deepEqual(Object.keys(pelna.scenariusze), ['p50', 'p75', 'p90']);
  assert.ok(pelna.zalozenia.length >= 5);
  assert.ok(pelna.ostrzezenia.some((o) => o.includes('Beta')));
  // Beta nie ma wlasnej historii, wiec jej wplyw nie liczy sie do pokrycia.
  assert.ok(pelna.scenariusze.p50.pokrycieHistoria < 1);
});

test('brak otwartych naleznosci daje pokrycie null zamiast falszywego 100%', () => {
  const { faktury, platnosci } = historiaDlaA();
  const stanFaktur = zbudujStanFaktur(faktury, platnosci, NA_DZIEN);
  const stanInwestycji = zbudujStanInwestycji([inwestycja('I-A', 'Alfa')], stanFaktur);
  const historia = historiaOpoznien(stanFaktur, stanInwestycji, 3);
  const wynik = projekcja({ stanFaktur, stanInwestycji, historia, konfiguracja: KONFIGURACJA, kluczScenariusza: 'p50' });
  assert.equal(wynik.pokrycieHistoria, null);
});
