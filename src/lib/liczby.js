// Kwoty i dzielenie odporne na braki.
//
// Zasada 1 (za raport-kliencki-pl): dzielenie bez mianownika => null (= "N/A"),
// nigdy NaN, Infinity ani zmyslone 0.
//
// Zasada 2 (nowa, specyficzna dla pieniedzy): kwoty trzymamy w GROSZACH jako liczby calkowite.
// Zmiennoprzecinkowe zlotowki kumuluja blad przy sumowaniu setek faktur
// (0.1 + 0.2 === 0.30000000000000004), a tu suma musi zgadzac sie z wyciagiem bankowym co do grosza.

const SPACJE = /[\s   ]/g; // zwykla, nielamliwa, waska nielamliwa, cyfrowa
const SUFIKS_WALUTY = /(zl|zł|pln)$/i;

// Parsuje kwote z komorki Excela do GROSZY (liczba calkowita).
// Akceptuje: "12 500,00", "12500.00", "1 234,56 zl", "-500", "(500)" jako wartosc ujemna.
export function parseKwota(raw, context = 'kwota') {
  if (typeof raw !== 'string') {
    throw new TypeError(`${context}: oczekiwano tekstu, otrzymano ${typeof raw}.`);
  }

  let tekst = raw.trim();
  if (tekst === '') {
    throw new Error(`${context}: pole jest puste.`);
  }

  // Ksiegowy zapis ujemnej kwoty: (1 234,56)
  let znak = 1;
  if (/^\(.*\)$/.test(tekst)) {
    znak = -1;
    tekst = tekst.slice(1, -1);
  }

  tekst = tekst.replace(SPACJE, '').replace(SUFIKS_WALUTY, '');

  if (tekst.startsWith('-')) {
    znak *= -1;
    tekst = tekst.slice(1);
  }
  if (tekst.startsWith('+')) {
    tekst = tekst.slice(1);
  }

  // Po usunieciu spacji zostaja same cyfry i separator dziesietny.
  // Kropka i przecinek jednoczesnie ("1,234.56" albo "1.234,56") => niejednoznaczne, odmawiamy.
  const maKropke = tekst.includes('.');
  const maPrzecinek = tekst.includes(',');
  if (maKropke && maPrzecinek) {
    throw new Error(
      `${context}: "${raw}" ma jednoczesnie kropke i przecinek. ` +
        'Nie zgaduje, ktory z nich jest separatorem dziesietnym — popraw zapis do "1234,56".',
    );
  }
  const znormalizowany = tekst.replace(',', '.');

  if (!/^\d+(\.\d+)?$/.test(znormalizowany)) {
    throw new Error(`${context}: "${raw}" nie jest poprawna kwota.`);
  }

  const [calosc, ulamek = ''] = znormalizowany.split('.');
  if (ulamek.length > 2) {
    throw new Error(
      `${context}: "${raw}" ma ${ulamek.length} miejsca po przecinku. Kwota faktury ma najwyzej 2.`,
    );
  }

  const grosze = Number(calosc) * 100 + Number((ulamek + '00').slice(0, 2));
  if (!Number.isSafeInteger(grosze)) {
    throw new Error(`${context}: "${raw}" jest poza bezpiecznym zakresem liczb.`);
  }
  return znak * grosze;
}

// Wariant dla pol, ktore MOGA byc puste. Puste => null (= "nie wiem"), NIE zero.
// Smiec w polu nadal rzuca bledem — pusto to co innego niz blednie.
export function parseKwotaOpcjonalna(raw, context = 'kwota') {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  return parseKwota(raw, context);
}

// Dzielenie odporne na N/A: null gdy mianownik jest 0, null lub nie-liczba, albo licznik jest null.
export function safeDiv(licznik, mianownik) {
  if (licznik == null || mianownik == null) return null;
  if (!Number.isFinite(licznik) || !Number.isFinite(mianownik)) return null;
  if (mianownik === 0) return null;
  return licznik / mianownik;
}

// Formatuje grosze jako polska kwote. Recznie, bez Intl — wynik ma byc identyczny
// niezaleznie od wersji ICU na maszynie, ktora generuje raport.
export function formatPLN(grosze, { waluta = true } = {}) {
  if (grosze == null || !Number.isFinite(grosze)) return 'N/A';
  const ujemna = grosze < 0;
  const absolutna = Math.abs(Math.round(grosze));
  const calosc = String(Math.floor(absolutna / 100));
  const reszta = String(absolutna % 100).padStart(2, '0');

  let zGrupami = '';
  for (let i = 0; i < calosc.length; i += 1) {
    if (i > 0 && (calosc.length - i) % 3 === 0) zGrupami += '\u00a0';
    zGrupami += calosc[i];
  }

  const podstawa = `${ujemna ? '-' : ''}${zGrupami},${reszta}`;
  return waluta ? `${podstawa}\u00a0zl` : podstawa;
}

// Procent z ulamka. null => "N/A" (nie 0%).
export function formatProcent(ulamek, miejsca = 0) {
  if (ulamek == null || !Number.isFinite(ulamek)) return 'N/A';
  return `${(ulamek * 100).toFixed(miejsca).replace('.', ',')}%`;
}

// Percentyl metoda "nearest-rank" na posortowanej kopii.
// Zwraca null przy pustym zbiorze — brak danych to brak danych, nie zero.
export function percentyl(wartosci, p) {
  const dane = wartosci.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (dane.length === 0) return null;
  const pozycja = Math.ceil((p / 100) * dane.length);
  const indeks = Math.min(Math.max(pozycja, 1), dane.length) - 1;
  return dane[indeks];
}
