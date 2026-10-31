import test from 'node:test';
import assert from 'node:assert/strict';
import { parseData, parseDataOpcjonalna, formatData, poczatekTygodnia, weekend } from '../src/lib/daty.js';

test('data w formacie ISO', () => {
  assert.equal(formatData(parseData('2026-08-11')), '2026-08-11');
});

test('data w polskim formacie z kropkami', () => {
  assert.equal(formatData(parseData('11.08.2026')), '2026-08-11');
  assert.equal(formatData(parseData('1.3.2026')), '2026-03-01');
});

test('data z ukosnikami jest odrzucana jako niejednoznaczna', () => {
  assert.throws(() => parseData('03/04/2026'), /niejednoznaczne/);
  assert.throws(() => parseData('01/02/2026'), /niejednoznaczne/);
});

test('nieistniejacy dzien miesiaca jest odrzucany', () => {
  assert.throws(() => parseData('31.02.2026'), /ma dzien 31/);
  assert.throws(() => parseData('2026-02-30'), /ma dzien 30/);
});

test('rok przestepny jest liczony poprawnie', () => {
  assert.equal(formatData(parseData('29.02.2028')), '2028-02-29');
  assert.throws(() => parseData('29.02.2026'), /ma dzien 29/);
});

test('miesiac poza zakresem jest odrzucany', () => {
  assert.throws(() => parseData('2026-13-01'), /miesiac 13/);
});

test('nierozpoznany format jest odrzucany z podpowiedzia', () => {
  assert.throws(() => parseData('11 sierpnia 2026'), /RRRR-MM-DD/);
  assert.throws(() => parseData(''), /puste/);
});

test('pole opcjonalne: pusta data to null', () => {
  assert.equal(parseDataOpcjonalna(''), null);
  assert.equal(formatData(parseDataOpcjonalna('2026-08-11')), '2026-08-11');
});

test('roznica dni jest liczbą calkowita, bez wplywu stref czasowych', () => {
  const a = parseData('2026-03-28');
  const b = parseData('2026-03-30'); // przez zmiane czasu na letni w PL
  assert.equal(b - a, 2);
});

test('poczatek tygodnia to poniedzialek', () => {
  // 2026-08-11 to wtorek.
  assert.equal(formatData(poczatekTygodnia(parseData('2026-08-11'))), '2026-08-10');
  // Poniedzialek zostaje soba.
  assert.equal(formatData(poczatekTygodnia(parseData('2026-08-10'))), '2026-08-10');
  // Niedziela nalezy do tygodnia, ktory zaczal sie 6 dni wczesniej.
  assert.equal(formatData(poczatekTygodnia(parseData('2026-08-16'))), '2026-08-10');
});

test('rozpoznawanie weekendu', () => {
  assert.equal(weekend(parseData('2026-08-15')), true); // sobota
  assert.equal(weekend(parseData('2026-08-16')), true); // niedziela
  assert.equal(weekend(parseData('2026-08-17')), false); // poniedzialek
});
