import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKwota, parseKwotaOpcjonalna, safeDiv, formatPLN, formatProcent, percentyl } from '../src/lib/liczby.js';

test('kwota w polskim zapisie ze zwykla spacja jako separatorem tysiecy', () => {
  assert.equal(parseKwota('12 500,00'), 1250000);
  assert.equal(parseKwota('1 850 000,00'), 185000000);
});

test('kwota z nielamliwymi spacjami (tak wkleja sie z Excela)', () => {
  assert.equal(parseKwota('12 500,00'), 1250000); // NBSP
  assert.equal(parseKwota('12 500,00'), 1250000); // waska NBSP
  assert.equal(parseKwota('12 500,00'), 1250000); // spacja cyfrowa
});

test('kwota z sufiksem waluty', () => {
  assert.equal(parseKwota('1\u00a0234,56\u00a0zl'), 123456);
  assert.equal(parseKwota('1 234,56 zł'), 123456);
  assert.equal(parseKwota('999,99 PLN'), 99999);
});

test('kwota z kropka jako separatorem dziesietnym', () => {
  assert.equal(parseKwota('1234.56'), 123456);
});

test('kropka i przecinek jednoczesnie sa odrzucane zamiast zgadywane', () => {
  assert.throws(() => parseKwota('1.234,56'), /kropke i przecinek/);
  assert.throws(() => parseKwota('1,234.56'), /kropke i przecinek/);
});

test('wiecej niz dwa miejsca po przecinku sa odrzucane', () => {
  assert.throws(() => parseKwota('100,123'), /miejsca po przecinku/);
});

test('zapis ksiegowy w nawiasach oznacza wartosc ujemna', () => {
  assert.equal(parseKwota('(1 234,56)'), -123456);
});

test('smiec w polu kwoty rzuca bledem, a nie zwraca zera', () => {
  assert.throws(() => parseKwota('brak danych'), /nie jest poprawna kwota/);
  assert.throws(() => parseKwota(''), /puste/);
});

test('pole opcjonalne: puste to null, ale smiec nadal jest bledem', () => {
  assert.equal(parseKwotaOpcjonalna(''), null);
  assert.equal(parseKwotaOpcjonalna('   '), null);
  assert.equal(parseKwotaOpcjonalna('50,00'), 5000);
  assert.throws(() => parseKwotaOpcjonalna('mniej wiecej 50'), /nie jest poprawna kwota/);
});

test('grosze jako liczby calkowite nie kumuluja bledu zmiennoprzecinkowego', () => {
  // W zlotowkach 0.1 + 0.2 daje 0.30000000000000004. W groszach nie ma czego kumulowac.
  assert.notEqual(0.1 + 0.2, 0.3);
  const suma = parseKwota('0,10') + parseKwota('0,20');
  assert.equal(suma, 30);
  assert.equal(formatPLN(suma), '0,30\u00a0zl');

  // Suma tysiaca faktur po 33 grosze musi byc dokladnie 330 zl.
  let razem = 0;
  for (let i = 0; i < 1000; i += 1) razem += parseKwota('0,33');
  assert.equal(razem, 33000);
  assert.equal(formatPLN(razem), '330,00\u00a0zl');
});

test('dzielenie bez mianownika daje null, nigdy NaN ani Infinity', () => {
  assert.equal(safeDiv(10, 0), null);
  assert.equal(safeDiv(10, null), null);
  assert.equal(safeDiv(null, 10), null);
  assert.equal(safeDiv(10, 2), 5);
});

test('formatowanie braku danych to N/A, nie zero', () => {
  assert.equal(formatPLN(null), 'N/A');
  assert.equal(formatProcent(null), 'N/A');
  assert.equal(formatProcent(0.815), '82%');
});

test('formatowanie kwot grupuje tysiace i nie zalezy od locale maszyny', () => {
  assert.equal(formatPLN(185000000), '1\u00a0850\u00a0000,00\u00a0zl');
  assert.equal(formatPLN(-28440000), '-284\u00a0400,00\u00a0zl');
  assert.equal(formatPLN(5, { waluta: false }), '0,05');
});

test('percentyl pustego zbioru to null', () => {
  assert.equal(percentyl([], 50), null);
});

test('percentyl metoda nearest-rank', () => {
  assert.equal(percentyl([21, 22, 25, 26], 50), 22);
  assert.equal(percentyl([21, 22, 25, 26], 75), 25);
  assert.equal(percentyl([21, 22, 25, 26], 90), 26);
  assert.equal(percentyl([44, 45, 62], 50), 45);
});
