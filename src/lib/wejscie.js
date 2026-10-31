// Wspolne wczytanie i walidacja wejsc. Uzywane zarowno przez validate.mjs (raportuje),
// jak i metrics.mjs (odmawia liczenia, gdy cokolwiek jest nie tak).
//
// Zbieramy WSZYSTKIE bledy naraz zamiast przerywac na pierwszym. Klient poprawiajacy arkusz
// chce zobaczyc pelna liste jednym przebiegiem, a nie odkrywac kolejny blad po kazdej poprawce.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsvAuto, rowsToRecords } from './csv.js';
import {
  NAGLOWKI_INWESTYCJE,
  NAGLOWKI_FAKTURY,
  NAGLOWKI_PLATNOSCI,
  kolumnyWrazliwe,
  duplikaty,
  osieroconeOdwolania,
} from './schema.js';
import { toInwestycja, toFaktura, toPlatnosc, toKonfiguracja } from './faktury.js';

const PLIKI = {
  inwestycje: { plik: 'inwestycje.csv', naglowki: NAGLOWKI_INWESTYCJE, klucz: 'id_inwestycji' },
  faktury: { plik: 'faktury.csv', naglowki: NAGLOWKI_FAKTURY, klucz: 'id_faktury' },
  platnosci: { plik: 'platnosci.csv', naglowki: NAGLOWKI_PLATNOSCI, klucz: 'id_platnosci' },
};

async function wczytajCsv(katalog, opis, bledy) {
  const sciezka = path.join(katalog, opis.plik);
  let tekst;
  try {
    tekst = await readFile(sciezka, 'utf8');
  } catch (error) {
    bledy.push(`${opis.plik}: nie udalo sie odczytac pliku (${error.code ?? error.message}).`);
    return null;
  }

  let wiersze;
  try {
    wiersze = parseCsvAuto(tekst);
  } catch (error) {
    bledy.push(`${opis.plik}: ${error.message}`);
    return null;
  }

  // Kontrola kolumn wrazliwych PRZED walidacja naglowka — chcemy powiedziec wprost,
  // ze problemem sa dane osobowe, a nie tylko "nieoczekiwana kolumna".
  if (wiersze.length > 0) {
    const wrazliwe = kolumnyWrazliwe(wiersze[0].map((h) => h.trim()));
    if (wrazliwe.length > 0) {
      bledy.push(
        `${opis.plik}: plik zawiera kolumny z danymi wrazliwymi: ${wrazliwe.join(', ')}. ` +
          'Do liczenia terminow i luki gotowkowej sa niepotrzebne, a podnosza szkode przy wycieku. ' +
          'Usun je z eksportu i wgraj plik ponownie.',
      );
    }
  }

  try {
    const rekordy = rowsToRecords(wiersze, opis.naglowki);
    for (const powtorzony of duplikaty(rekordy, opis.klucz)) {
      bledy.push(
        `${opis.plik}: "${powtorzony.klucz}" wystepuje dwa razy ` +
          `(wiersz ${powtorzony.pierwszy} i ${powtorzony.kolejny}). Duplikat zawyzy sumy.`,
      );
    }
    return rekordy;
  } catch (error) {
    bledy.push(`${opis.plik}: ${error.message}`);
    return null;
  }
}

// Mapuje rekordy na obiekty domenowe, zbierajac bledy zamiast przerywac na pierwszym.
function zmapuj(rekordy, konwerter, nazwaPliku, bledy) {
  const wynik = [];
  for (const rekord of rekordy) {
    try {
      wynik.push(konwerter(rekord));
    } catch (error) {
      bledy.push(`${nazwaPliku}: ${error.message}`);
    }
  }
  return wynik;
}

export async function wczytajWejscia(katalog) {
  const bledy = [];
  const ostrzezenia = [];

  let konfiguracja = null;
  try {
    const surowa = JSON.parse(await readFile(path.join(katalog, 'konfiguracja.json'), 'utf8'));
    konfiguracja = toKonfiguracja(surowa);
  } catch (error) {
    bledy.push(`konfiguracja.json: ${error.message}`);
  }

  const rekordyInwestycji = await wczytajCsv(katalog, PLIKI.inwestycje, bledy);
  const rekordyFaktur = await wczytajCsv(katalog, PLIKI.faktury, bledy);
  const rekordyPlatnosci = await wczytajCsv(katalog, PLIKI.platnosci, bledy);

  const inwestycje = rekordyInwestycji
    ? zmapuj(rekordyInwestycji, toInwestycja, 'inwestycje.csv', bledy)
    : [];
  const faktury = rekordyFaktur ? zmapuj(rekordyFaktur, toFaktura, 'faktury.csv', bledy) : [];
  const platnosci = rekordyPlatnosci
    ? zmapuj(rekordyPlatnosci, toPlatnosc, 'platnosci.csv', bledy)
    : [];

  // Spojnosc miedzy plikami.
  if (rekordyInwestycji && rekordyFaktur) {
    const znane = new Set(inwestycje.map((i) => i.id));
    for (const sierota of osieroconeOdwolania(rekordyFaktur, 'id_inwestycji', znane)) {
      bledy.push(
        `faktury.csv: wiersz ${sierota.wiersz} wskazuje na inwestycje "${sierota.wartosc}", ` +
          'ktorej nie ma w inwestycje.csv.',
      );
    }
  }
  if (rekordyFaktur && rekordyPlatnosci) {
    const znane = new Set(faktury.map((f) => f.id));
    for (const sierota of osieroconeOdwolania(rekordyPlatnosci, 'id_faktury', znane)) {
      bledy.push(
        `platnosci.csv: wiersz ${sierota.wiersz} wskazuje na fakture "${sierota.wartosc}", ` +
          'ktorej nie ma w faktury.csv. Wplata bez faktury nie zostanie nigdzie policzona.',
      );
    }
  }

  // Kontrole miekkie — nie blokuja, ale warto o nich wiedziec.
  const wgFaktury = new Map(faktury.map((f) => [f.id, f]));
  for (const platnosc of platnosci) {
    const faktura = wgFaktury.get(platnosc.idFaktury);
    if (!faktura) continue;
    if (platnosc.data < faktura.dataWystawienia) {
      bledy.push(
        `platnosci.csv: wplata ${platnosc.id} ma date wczesniejsza niz wystawienie faktury ${faktura.id}.`,
      );
    }
  }
  const sumaWplat = new Map();
  for (const platnosc of platnosci) {
    sumaWplat.set(platnosc.idFaktury, (sumaWplat.get(platnosc.idFaktury) ?? 0) + platnosc.kwota);
  }
  for (const [idFaktury, suma] of sumaWplat) {
    const faktura = wgFaktury.get(idFaktury);
    if (faktura && suma > faktura.kwotaBrutto) {
      ostrzezenia.push(
        `Faktura ${idFaktury}: wplaty (${suma / 100} zl) przekraczaja kwote faktury ` +
          `(${faktura.kwotaBrutto / 100} zl). Nadplata zostanie pokazana osobno, nie zniknie.`,
      );
    }
  }

  if (konfiguracja) {
    const przyszle = platnosci.filter((p) => p.data > konfiguracja.naDzien);
    if (przyszle.length > 0) {
      ostrzezenia.push(
        `${przyszle.length} wplat ma date pozniejsza niz dzien raportu. ` +
          'Zostana pominiete, zeby raport pokazywal stan wiedzy z tego dnia.',
      );
    }
  }

  return { konfiguracja, inwestycje, faktury, platnosci, bledy, ostrzezenia };
}
