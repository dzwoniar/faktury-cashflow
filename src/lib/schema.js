// Schemat wejsc i twarde kontrole spojnosci.
//
// Filozofia (za raport-kliencki-pl i Teczka): przy niepewnosci system ODMAWIA zamiast zgadywac.
// Zle policzony termin platnosci jest gorszy niz brak wyniku, bo brak wyniku widac od razu,
// a zla liczba wyglada dokladnie tak samo jak dobra.

export const NAGLOWKI_INWESTYCJE = [
  'id_inwestycji',
  'nazwa',
  'inwestor',
  'etap',
  'data_startu',
  'wartosc_kontraktu',
  'kaucja_proc',
  'status',
];

export const NAGLOWKI_FAKTURY = [
  'id_faktury',
  'id_inwestycji',
  'typ',
  'kontrahent',
  'data_wystawienia',
  'termin_platnosci',
  'kwota_brutto',
];

export const NAGLOWKI_PLATNOSCI = ['id_platnosci', 'id_faktury', 'data', 'kwota'];

export const STATUSY_INWESTYCJI = ['w_przygotowaniu', 'w_trakcie', 'zakonczona'];
export const TYPY_FAKTURY = ['sprzedaz', 'zakup'];

// Kolumny, ktorych to narzedzie nie potrzebuje i ktore nie maja prawa tu trafic.
// Do policzenia terminow i luki gotowkowej wystarcza kwoty i daty. Numer konta, PESEL czy
// adres e-mail podwykonawcy zwiekszaja tylko szkode przy wycieku.
const KOLUMNY_WRAZLIWE = [
  'pesel',
  'nip_osoby',
  'dowod',
  'iban',
  'nr_konta',
  'numer_konta',
  'konto_bankowe',
  'rachunek',
  'email',
  'e-mail',
  'mail',
  'telefon',
  'phone',
  'adres_zamieszkania',
  'data_urodzenia',
];

export function kolumnyWrazliwe(naglowki) {
  return naglowki.filter((h) => {
    const n = h.toLowerCase();
    return KOLUMNY_WRAZLIWE.some((igla) => n.includes(igla));
  });
}

// Duplikaty w kolumnie identyfikatora. Dwie faktury o tym samym numerze to albo pomylka
// w eksporcie, albo realny duplikat w systemie — w obu przypadkach liczby wyjda zawyzone.
export function duplikaty(rekordy, pole) {
  const widziane = new Map();
  const powtorzone = [];
  for (const rekord of rekordy) {
    const klucz = rekord[pole];
    if (widziane.has(klucz)) {
      powtorzone.push({ klucz, pierwszy: widziane.get(klucz), kolejny: rekord.__row });
    } else {
      widziane.set(klucz, rekord.__row);
    }
  }
  return powtorzone;
}

// Sprawdza, czy kazda wartosc z pola wskazuje na istniejacy rekord nadrzedny.
export function osieroconeOdwolania(rekordy, pole, znaneKlucze) {
  return rekordy
    .filter((rekord) => !znaneKlucze.has(rekord[pole]))
    .map((rekord) => ({ wiersz: rekord.__row, wartosc: rekord[pole] }));
}

// Dopuszczalne wartosci pola slownikowego.
export function zlaWartoscSlownika(rekordy, pole, dozwolone) {
  return rekordy
    .filter((rekord) => !dozwolone.includes(rekord[pole]))
    .map((rekord) => ({ wiersz: rekord.__row, wartosc: rekord[pole] }));
}
