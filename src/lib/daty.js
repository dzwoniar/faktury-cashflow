// Daty jako liczba dni od epoki (UTC), nie obiekty Date.
//
// Powod: caly rachunek terminow to odejmowanie dni. Obiekt Date wciaga strefy czasowe i czas letni,
// przez co "termin minus dzisiaj" potrafi dac 29,958333 dnia. Liczba calkowita nie potrafi.
//
// Zasada parsowania: przyjmujemy formaty JEDNOZNACZNE, odrzucamy niejednoznaczne.
// "15.03.2026" jest jednoznaczne (nie ma 15. miesiaca). "03/04/2026" nie jest — moze byc
// 3 kwietnia albo 4 marca. Zgadywanie kosztuje miesiac roznicy w terminie platnosci,
// wiec zamiast zgadywac, odmawiamy i mowimy dlaczego.

const MS_NA_DZIEN = 86400000;
const DNI_TYGODNIA = ['poniedzialek', 'wtorek', 'sroda', 'czwartek', 'piatek', 'sobota', 'niedziela'];

function dniWMiesiacu(rok, miesiac) {
  return new Date(Date.UTC(rok, miesiac, 0)).getUTCDate();
}

function doNumeruDnia(rok, miesiac, dzien, raw, context) {
  if (miesiac < 1 || miesiac > 12) {
    throw new Error(`${context}: "${raw}" ma miesiac ${miesiac}. Poza zakresem 1-12.`);
  }
  const maks = dniWMiesiacu(rok, miesiac);
  if (dzien < 1 || dzien > maks) {
    throw new Error(`${context}: "${raw}" ma dzien ${dzien}, a ${miesiac}/${rok} ma ich ${maks}.`);
  }
  return Math.round(Date.UTC(rok, miesiac - 1, dzien) / MS_NA_DZIEN);
}

// Parsuje date do numeru dnia. Akceptuje "YYYY-MM-DD" i "DD.MM.YYYY".
export function parseData(raw, context = 'data') {
  if (typeof raw !== 'string') {
    throw new TypeError(`${context}: oczekiwano tekstu, otrzymano ${typeof raw}.`);
  }
  const tekst = raw.trim();
  if (tekst === '') {
    throw new Error(`${context}: pole jest puste.`);
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(tekst);
  if (iso) {
    return doNumeruDnia(Number(iso[1]), Number(iso[2]), Number(iso[3]), tekst, context);
  }

  const polski = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(tekst);
  if (polski) {
    return doNumeruDnia(Number(polski[3]), Number(polski[2]), Number(polski[1]), tekst, context);
  }

  // Ukosnik z dwoma dwucyfrowymi czlonami — klasyczna pulapka DD/MM vs MM/DD.
  const ukosnik = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(tekst);
  if (ukosnik) {
    const a = Number(ukosnik[1]);
    const b = Number(ukosnik[2]);
    if (a <= 12 && b <= 12 && a !== b) {
      throw new Error(
        `${context}: "${tekst}" jest niejednoznaczne — moze znaczyc ${a}.${b} albo ${b}.${a}. ` +
          'Roznica to nawet kilkadziesiat dni w terminie platnosci, wiec system nie zgaduje. ' +
          'Zapisz jako "RRRR-MM-DD" albo "DD.MM.RRRR".',
      );
    }
  }

  throw new Error(
    `${context}: "${tekst}" nie jest data w obslugiwanym formacie. ` +
      'Przyjmowane sa "RRRR-MM-DD" oraz "DD.MM.RRRR".',
  );
}

// Wariant dla pol, ktore MOGA byc puste (np. data zaplaty faktury nieoplaconej).
export function parseDataOpcjonalna(raw, context = 'data') {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  return parseData(raw, context);
}

// Numer dnia => "RRRR-MM-DD".
export function formatData(numerDnia) {
  if (numerDnia == null || !Number.isFinite(numerDnia)) return 'N/A';
  const d = new Date(numerDnia * MS_NA_DZIEN);
  const rok = d.getUTCFullYear();
  const miesiac = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dzien = String(d.getUTCDate()).padStart(2, '0');
  return `${rok}-${miesiac}-${dzien}`;
}

export function dodajDni(numerDnia, ile) {
  return numerDnia + ile;
}

// Poniedzialek tygodnia, w ktorym wypada dany dzien.
// Dzien 0 epoki to czwartek 1970-01-01, stad przesuniecie o 3.
export function poczatekTygodnia(numerDnia) {
  return numerDnia - (((numerDnia + 3) % 7) + 7) % 7;
}

export function nazwaDniaTygodnia(numerDnia) {
  return DNI_TYGODNIA[((((numerDnia + 3) % 7) + 7) % 7)];
}

// Czy dzien wypada w sobote lub niedziele. Przydatne przy terminach platnosci —
// przelew zlecony w piatek i tak ksieguje sie w poniedzialek.
export function weekend(numerDnia) {
  const indeks = ((((numerDnia + 3) % 7) + 7) % 7);
  return indeks >= 5;
}
