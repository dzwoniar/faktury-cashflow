// Silnik faktur: dopasowanie platnosci do faktur, stany, wiekowanie naleznosci, agregaty per inwestycja.
//
// Kluczowa decyzja architektoniczna: FAKTURA I PLATNOSC TO DWA OSOBNE ZRODLA.
// Faktura mowi, ile i do kiedy. Wyciag bankowy mowi, czy i kiedy wplyneto. Rejestr faktur
// (KSeF, program ksiegowy, eksport z Excela) nie zawiera informacji o zaplacie, wiec kolumna
// "oplacone: tak/nie" prowadzona recznie w arkuszu jest deklaracja, nie faktem.
// Tu stan faktury WYNIKA z dopasowanych platnosci i nie da sie go nadpisac recznie.

import { parseKwota, parseKwotaOpcjonalna } from './liczby.js';
import { parseData, parseDataOpcjonalna } from './daty.js';
import { STATUSY_INWESTYCJI, TYPY_FAKTURY } from './schema.js';

export const PRZEDZIALY_WIEKOWANIA = ['biezaca', '1-30', '31-60', '61-90', '90+'];

// --- wczytanie i typowanie -------------------------------------------------

export function toInwestycja(rekord) {
  const kaucjaProc = Number(rekord.kaucja_proc.replace(',', '.'));
  if (!Number.isFinite(kaucjaProc) || kaucjaProc < 0 || kaucjaProc > 100) {
    throw new Error(
      `Wiersz ${rekord.__row} (kaucja_proc): "${rekord.kaucja_proc}" nie jest procentem z zakresu 0-100.`,
    );
  }
  if (!STATUSY_INWESTYCJI.includes(rekord.status)) {
    throw new Error(
      `Wiersz ${rekord.__row} (status): "${rekord.status}" nie jest jednym z: ${STATUSY_INWESTYCJI.join(', ')}.`,
    );
  }
  const wartoscKontraktu = parseKwota(
    rekord.wartosc_kontraktu,
    `Wiersz ${rekord.__row} (wartosc_kontraktu)`,
  );
  return {
    id: rekord.id_inwestycji,
    nazwa: rekord.nazwa,
    inwestor: rekord.inwestor,
    etap: rekord.etap,
    dataStartu: parseData(rekord.data_startu, `Wiersz ${rekord.__row} (data_startu)`),
    wartoscKontraktu,
    kaucjaProc,
    kaucja: Math.round((wartoscKontraktu * kaucjaProc) / 100),
    status: rekord.status,
  };
}

export function toFaktura(rekord) {
  if (!TYPY_FAKTURY.includes(rekord.typ)) {
    throw new Error(
      `Wiersz ${rekord.__row} (typ): "${rekord.typ}" nie jest jednym z: ${TYPY_FAKTURY.join(', ')}.`,
    );
  }
  const dataWystawienia = parseData(
    rekord.data_wystawienia,
    `Wiersz ${rekord.__row} (data_wystawienia)`,
  );
  const terminPlatnosci = parseData(
    rekord.termin_platnosci,
    `Wiersz ${rekord.__row} (termin_platnosci)`,
  );
  if (terminPlatnosci < dataWystawienia) {
    throw new Error(
      `Wiersz ${rekord.__row}: termin platnosci (${rekord.termin_platnosci}) jest wczesniejszy ` +
        `niz data wystawienia (${rekord.data_wystawienia}).`,
    );
  }
  const kwotaBrutto = parseKwota(rekord.kwota_brutto, `Wiersz ${rekord.__row} (kwota_brutto)`);
  if (kwotaBrutto <= 0) {
    throw new Error(
      `Wiersz ${rekord.__row} (kwota_brutto): "${rekord.kwota_brutto}" nie jest kwota dodatnia. ` +
        'Korekty i faktury na minus wymagaja osobnej obslugi, ktorej ten import nie ma.',
    );
  }
  return {
    id: rekord.id_faktury,
    idInwestycji: rekord.id_inwestycji,
    typ: rekord.typ,
    kontrahent: rekord.kontrahent,
    dataWystawienia,
    terminPlatnosci,
    kwotaBrutto,
  };
}

export function toPlatnosc(rekord) {
  return {
    id: rekord.id_platnosci,
    idFaktury: rekord.id_faktury,
    data: parseData(rekord.data, `Wiersz ${rekord.__row} (data)`),
    kwota: parseKwota(rekord.kwota, `Wiersz ${rekord.__row} (kwota)`),
  };
}

export function toKonfiguracja(surowa) {
  const wymagane = ['firma', 'na_dzien', 'saldo_poczatkowe', 'horyzont_tygodni'];
  for (const pole of wymagane) {
    if (surowa[pole] == null) {
      throw new Error(`konfiguracja.json: brak wymaganego pola "${pole}".`);
    }
  }
  const horyzont = Number(surowa.horyzont_tygodni);
  if (!Number.isInteger(horyzont) || horyzont < 1 || horyzont > 104) {
    throw new Error('konfiguracja.json: "horyzont_tygodni" musi byc liczba calkowita z zakresu 1-104.');
  }
  return {
    firma: String(surowa.firma),
    naDzien: parseData(String(surowa.na_dzien), 'konfiguracja.json (na_dzien)'),
    saldoPoczatkowe: parseKwota(String(surowa.saldo_poczatkowe), 'konfiguracja.json (saldo_poczatkowe)'),
    horyzontTygodni: horyzont,
    minHistoriiDoPrognozy: Number(surowa.min_historii_do_prognozy ?? 3),
    // Ile dni zapasu operacyjnego chce miec firma na koncie. Sluzy tylko do oznaczenia
    // tygodni ponizej progu — narzedzie nie wydaje werdyktu, tylko podswietla.
    minimalnaPoduszka: parseKwotaOpcjonalna(
      surowa.minimalna_poduszka == null ? '' : String(surowa.minimalna_poduszka),
      'konfiguracja.json (minimalna_poduszka)',
    ),
  };
}

// --- stan faktur -----------------------------------------------------------

function przedzialWiekowania(dniPoTerminie) {
  if (dniPoTerminie <= 0) return 'biezaca';
  if (dniPoTerminie <= 30) return '1-30';
  if (dniPoTerminie <= 60) return '31-60';
  if (dniPoTerminie <= 90) return '61-90';
  return '90+';
}

// Laczy faktury z platnosciami i wylicza stan kazdej faktury na wskazany dzien.
// Platnosci pozniejsze niz `naDzien` sa celowo POMIJANE — raport na 30 czerwca ma pokazywac
// to, co bylo wiadomo 30 czerwca, a nie to, co doszlo pozniej.
export function zbudujStanFaktur(faktury, platnosci, naDzien) {
  const wgFaktury = new Map();
  for (const platnosc of platnosci) {
    if (platnosc.data > naDzien) continue;
    if (!wgFaktury.has(platnosc.idFaktury)) wgFaktury.set(platnosc.idFaktury, []);
    wgFaktury.get(platnosc.idFaktury).push(platnosc);
  }

  return faktury
    .map((faktura) => {
      const wplaty = (wgFaktury.get(faktura.id) ?? []).sort((a, b) =>
        a.data === b.data ? a.id.localeCompare(b.id) : a.data - b.data,
      );
      const zaplacono = wplaty.reduce((suma, w) => suma + w.kwota, 0);
      const pozostalo = faktura.kwotaBrutto - zaplacono;
      const dniPoTerminie = naDzien - faktura.terminPlatnosci;

      let stan;
      if (pozostalo <= 0) stan = 'oplacona';
      else if (zaplacono > 0) stan = 'czesciowo';
      else stan = 'nieoplacona';

      const otwarta = pozostalo > 0;
      return {
        ...faktura,
        wplaty,
        zaplacono,
        pozostalo: Math.max(pozostalo, 0),
        nadplata: pozostalo < 0 ? -pozostalo : 0,
        stan,
        otwarta,
        dniDoTerminu: faktura.terminPlatnosci - naDzien,
        dniPoTerminie: otwarta && dniPoTerminie > 0 ? dniPoTerminie : 0,
        przeterminowana: otwarta && dniPoTerminie > 0,
        przedzial: otwarta ? przedzialWiekowania(dniPoTerminie) : 'oplacona',
        // Dzien domkniecia faktury = data ostatniej wplaty, ktora zbila saldo do zera.
        dataDomkniecia: pozostalo <= 0 && wplaty.length > 0 ? wplaty[wplaty.length - 1].data : null,
      };
    })
    .sort((a, b) => (a.terminPlatnosci === b.terminPlatnosci
      ? a.id.localeCompare(b.id)
      : a.terminPlatnosci - b.terminPlatnosci));
}

// --- agregaty per inwestycja ----------------------------------------------

export function zbudujStanInwestycji(inwestycje, stanFaktur) {
  const wgInwestycji = new Map();
  for (const faktura of stanFaktur) {
    if (!wgInwestycji.has(faktura.idInwestycji)) wgInwestycji.set(faktura.idInwestycji, []);
    wgInwestycji.get(faktura.idInwestycji).push(faktura);
  }

  return inwestycje
    .map((inwestycja) => {
      const jej = wgInwestycji.get(inwestycja.id) ?? [];
      const sprzedaz = jej.filter((f) => f.typ === 'sprzedaz');
      const zakup = jej.filter((f) => f.typ === 'zakup');

      const suma = (lista, pole) => lista.reduce((acc, f) => acc + f[pole], 0);

      const zafakturowano = suma(sprzedaz, 'kwotaBrutto');
      const naleznosci = suma(sprzedaz, 'pozostalo');
      const naleznosciPrzeterminowane = suma(
        sprzedaz.filter((f) => f.przeterminowana),
        'pozostalo',
      );
      const kosztyZafakturowane = suma(zakup, 'kwotaBrutto');
      const zobowiazania = suma(zakup, 'pozostalo');
      const zobowiazaniaPrzeterminowane = suma(
        zakup.filter((f) => f.przeterminowana),
        'pozostalo',
      );

      // Ile z kontraktu nie zostalo jeszcze zafakturowane. To jest odpowiednik pytania
      // "co zostalo do zrobienia", wyrazony w pieniadzach zamiast w checkliscie.
      const doZafakturowania = inwestycja.wartoscKontraktu - zafakturowano;

      return {
        ...inwestycja,
        liczbaFaktur: jej.length,
        zafakturowano,
        zaplaconoPrzezInwestora: zafakturowano - naleznosci,
        naleznosci,
        naleznosciPrzeterminowane,
        kosztyZafakturowane,
        kosztyZaplacone: kosztyZafakturowane - zobowiazania,
        zobowiazania,
        zobowiazaniaPrzeterminowane,
        doZafakturowania,
        przekroczonyKontrakt: doZafakturowania < 0,
        marzaZafakturowana: zafakturowano - kosztyZafakturowane,
        najstarszaZaleglosc: sprzedaz
          .filter((f) => f.przeterminowana)
          .reduce((maks, f) => Math.max(maks, f.dniPoTerminie), 0),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

// --- podsumowanie globalne -------------------------------------------------

export function podsumowanie(stanFaktur, stanInwestycji, konfiguracja) {
  const sprzedaz = stanFaktur.filter((f) => f.typ === 'sprzedaz');
  const zakup = stanFaktur.filter((f) => f.typ === 'zakup');
  const suma = (lista, pole) => lista.reduce((acc, f) => acc + f[pole], 0);

  const wiekowanie = {};
  for (const przedzial of PRZEDZIALY_WIEKOWANIA) {
    const otwarteSprzedaz = sprzedaz.filter((f) => f.otwarta && f.przedzial === przedzial);
    const otwarteZakup = zakup.filter((f) => f.otwarta && f.przedzial === przedzial);
    wiekowanie[przedzial] = {
      naleznosci: suma(otwarteSprzedaz, 'pozostalo'),
      liczbaNaleznosci: otwarteSprzedaz.length,
      zobowiazania: suma(otwarteZakup, 'pozostalo'),
      liczbaZobowiazan: otwarteZakup.length,
    };
  }

  return {
    naDzien: konfiguracja.naDzien,
    saldoPoczatkowe: konfiguracja.saldoPoczatkowe,
    liczbaInwestycji: stanInwestycji.length,
    inwestycjeWTrakcie: stanInwestycji.filter((i) => i.status === 'w_trakcie').length,
    inwestycjeWPrzygotowaniu: stanInwestycji.filter((i) => i.status === 'w_przygotowaniu').length,
    inwestycjeZakonczone: stanInwestycji.filter((i) => i.status === 'zakonczona').length,
    liczbaFaktur: stanFaktur.length,
    naleznosci: suma(sprzedaz.filter((f) => f.otwarta), 'pozostalo'),
    naleznosciPrzeterminowane: suma(sprzedaz.filter((f) => f.przeterminowana), 'pozostalo'),
    liczbaPrzeterminowanychNaleznosci: sprzedaz.filter((f) => f.przeterminowana).length,
    zobowiazania: suma(zakup.filter((f) => f.otwarta), 'pozostalo'),
    zobowiazaniaPrzeterminowane: suma(zakup.filter((f) => f.przeterminowana), 'pozostalo'),
    liczbaPrzeterminowanychZobowiazan: zakup.filter((f) => f.przeterminowana).length,
    // Kaucje zatrzymane na inwestycjach, ktore nie zostaly jeszcze odebrane.
    // To pieniadze zafakturowane i nalezne, ale niedostepne do konca odbioru — dlatego osobno.
    kaucjeZatrzymane: stanInwestycji
      .filter((i) => i.status !== 'zakonczona')
      .reduce((acc, i) => acc + i.kaucja, 0),
    wiekowanie,
  };
}
