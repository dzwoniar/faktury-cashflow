import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseCsvAuto, detectDelimiter, rowsToRecords } from '../src/lib/csv.js';
import { zbudujStanFaktur, zbudujStanInwestycji, toFaktura } from '../src/lib/faktury.js';
import { parseData, formatData } from '../src/lib/daty.js';

const NA_DZIEN = parseData('2026-08-11');

function faktura(nadpisania = {}) {
  return {
    id: 'FS/1',
    idInwestycji: 'I-001',
    typ: 'sprzedaz',
    kontrahent: 'Inwestor',
    dataWystawienia: parseData('2026-07-01'),
    terminPlatnosci: parseData('2026-07-31'),
    kwotaBrutto: 100000,
    ...nadpisania,
  };
}

function wplata(nadpisania = {}) {
  return { id: 'P-1', idFaktury: 'FS/1', data: parseData('2026-08-01'), kwota: 100000, ...nadpisania };
}

test('parser CSV zjada BOM z poczatku pliku', () => {
  const wiersze = parseCsv('﻿a;b\n1;2\n');
  assert.deepEqual(wiersze[0], ['a', 'b']);
});

test('parser CSV obsluguje cudzyslowy i separator wewnatrz pola', () => {
  const wiersze = parseCsv('a;b\n"Firma; z przecinkiem";2\n');
  assert.deepEqual(wiersze[1], ['Firma; z przecinkiem', '2']);
});

test('separator jest wykrywany z naglowka', () => {
  assert.equal(detectDelimiter('id;nazwa;kwota\n1;a;2\n'), ';');
  assert.equal(detectDelimiter('id,nazwa,kwota\n1,a,2\n'), ',');
  // Przecinek w nazwie kolumny w cudzyslowie nie przewaza wyniku.
  assert.equal(detectDelimiter('id;"nazwa, pelna";kwota\n'), ';');
});

test('parseCsvAuto radzi sobie z eksportem przecinkowym', () => {
  const wiersze = parseCsvAuto('id,nazwa\n1,Alfa\n');
  assert.deepEqual(wiersze[1], ['1', 'Alfa']);
});

test('naglowek niezgodny ze schematem jest odrzucany z lista roznic', () => {
  assert.throws(
    () => rowsToRecords([['id', 'kwota']], ['id', 'nazwa']),
    /brak kolumn: nazwa.*nieoczekiwane kolumny: kwota/s,
  );
});

test('faktura z terminem wczesniejszym niz wystawienie jest odrzucana', () => {
  assert.throws(
    () =>
      toFaktura({
        __row: 2,
        id_faktury: 'FS/1',
        id_inwestycji: 'I-001',
        typ: 'sprzedaz',
        kontrahent: 'X',
        data_wystawienia: '2026-07-20',
        termin_platnosci: '2026-07-01',
        kwota_brutto: '100,00',
      }),
    /wczesniejszy/,
  );
});

test('nieznany typ faktury jest odrzucany', () => {
  assert.throws(
    () =>
      toFaktura({
        __row: 2,
        id_faktury: 'FS/1',
        id_inwestycji: 'I-001',
        typ: 'korekta',
        kontrahent: 'X',
        data_wystawienia: '2026-07-01',
        termin_platnosci: '2026-07-31',
        kwota_brutto: '100,00',
      }),
    /nie jest jednym z: sprzedaz, zakup/,
  );
});

test('platnosc czesciowa daje stan "czesciowo" i poprawna reszte', () => {
  const [stan] = zbudujStanFaktur([faktura()], [wplata({ kwota: 40000 })], NA_DZIEN);
  assert.equal(stan.stan, 'czesciowo');
  assert.equal(stan.zaplacono, 40000);
  assert.equal(stan.pozostalo, 60000);
  assert.equal(stan.otwarta, true);
});

test('brak platnosci daje stan "nieoplacona", a nie zero do zaplaty', () => {
  const [stan] = zbudujStanFaktur([faktura()], [], NA_DZIEN);
  assert.equal(stan.stan, 'nieoplacona');
  assert.equal(stan.pozostalo, 100000);
});

test('platnosc pozniejsza niz dzien raportu jest pomijana', () => {
  const [stan] = zbudujStanFaktur([faktura()], [wplata({ data: parseData('2026-08-12') })], NA_DZIEN);
  assert.equal(stan.stan, 'nieoplacona');
  assert.equal(stan.zaplacono, 0);
});

test('faktura z terminem dokladnie w dniu raportu nie jest przeterminowana', () => {
  const [stan] = zbudujStanFaktur([faktura({ terminPlatnosci: NA_DZIEN })], [], NA_DZIEN);
  assert.equal(stan.przeterminowana, false);
  assert.equal(stan.dniDoTerminu, 0);
  assert.equal(stan.przedzial, 'biezaca');
});

test('faktura dzien po terminie wpada w przedzial 1-30', () => {
  const [stan] = zbudujStanFaktur([faktura({ terminPlatnosci: NA_DZIEN - 1 })], [], NA_DZIEN);
  assert.equal(stan.przeterminowana, true);
  assert.equal(stan.dniPoTerminie, 1);
  assert.equal(stan.przedzial, '1-30');
});

test('granice przedzialow wiekowania', () => {
  const przedzial = (dni) => zbudujStanFaktur([faktura({ terminPlatnosci: NA_DZIEN - dni })], [], NA_DZIEN)[0].przedzial;
  assert.equal(przedzial(30), '1-30');
  assert.equal(przedzial(31), '31-60');
  assert.equal(przedzial(60), '31-60');
  assert.equal(przedzial(61), '61-90');
  assert.equal(przedzial(91), '90+');
});

test('faktura oplacona po terminie nie liczy sie jako przeterminowana', () => {
  const [stan] = zbudujStanFaktur([faktura({ terminPlatnosci: NA_DZIEN - 40 })], [wplata()], NA_DZIEN);
  assert.equal(stan.stan, 'oplacona');
  assert.equal(stan.przeterminowana, false);
  assert.equal(stan.przedzial, 'oplacona');
  assert.equal(formatData(stan.dataDomkniecia), '2026-08-01');
});

test('nadplata jest pokazana osobno, a nie ukryta jako ujemna reszta', () => {
  const [stan] = zbudujStanFaktur([faktura()], [wplata({ kwota: 120000 })], NA_DZIEN);
  assert.equal(stan.pozostalo, 0);
  assert.equal(stan.nadplata, 20000);
});

test('agregat inwestycji rozdziela naleznosci od zobowiazan', () => {
  const inwestycja = {
    id: 'I-001',
    nazwa: 'Test',
    inwestor: 'Inwestor',
    etap: 'x',
    dataStartu: parseData('2026-01-01'),
    wartoscKontraktu: 500000,
    kaucjaProc: 10,
    kaucja: 50000,
    status: 'w_trakcie',
  };
  const stanFaktur = zbudujStanFaktur(
    [
      faktura({ id: 'FS/1', typ: 'sprzedaz', kwotaBrutto: 300000 }),
      faktura({ id: 'FZ/1', typ: 'zakup', kwotaBrutto: 120000 }),
    ],
    [wplata({ id: 'P-1', idFaktury: 'FS/1', kwota: 100000 })],
    NA_DZIEN,
  );
  const [stan] = zbudujStanInwestycji([inwestycja], stanFaktur);
  assert.equal(stan.zafakturowano, 300000);
  assert.equal(stan.naleznosci, 200000);
  assert.equal(stan.zobowiazania, 120000);
  assert.equal(stan.doZafakturowania, 200000);
  assert.equal(stan.marzaZafakturowana, 180000);
});
