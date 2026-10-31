// Projekcja gotowki tydzien po tygodniu.
//
// CZEGO TO NARZEDZIE NIE ROBI, SWIADOMIE:
// nie zwraca werdyktu "mozesz / nie mozesz zaczac kolejnej inwestycji". Pokazuje, kiedy i o ile
// saldo schodzi ponizej poduszki przy trzech scenariuszach opoznien inwestora, wypisuje zalozenia,
// na ktorych to policzono, i podaje, jaka czesc prognozy ma pokrycie w realnej historii wplat.
// Decyzja zostaje po stronie wlasciciela, bo to on zna rzeczy, ktorych nie ma w zadnym arkuszu:
// obietnice telefoniczne, zaawansowanie robot, linie kredytowe.
//
// Prognoza jest warta tyle, ile historii dopasowanych par faktura -> wplata. Gdy historii nie ma,
// zwracamy null (= "N/A") i mowimy dlaczego, zamiast podstawiac srednia z sufitu.

import { percentyl, safeDiv } from './liczby.js';
import { poczatekTygodnia } from './daty.js';

export const SCENARIUSZE = [
  { klucz: 'p50', percentyl: 50, etykieta: 'Typowy', opis: 'Mediana opoznien z historii tego inwestora.' },
  { klucz: 'p75', percentyl: 75, etykieta: 'Ostrozny', opis: 'Trzy na cztery wplaty historycznie przyszly szybciej.' },
  { klucz: 'p90', percentyl: 90, etykieta: 'Pesymistyczny', opis: 'Dziewiec na dziesiec wplat historycznie przyszlo szybciej.' },
];

// Historia opoznien per inwestor, liczona WYLACZNIE z faktur domknietych do zera.
// Opoznienie = dzien ostatniej wplaty minus termin platnosci. Wartosc ujemna = zaplacone przed terminem.
export function historiaOpoznien(stanFaktur, stanInwestycji, minHistorii = 3) {
  const inwestorWgInwestycji = new Map(stanInwestycji.map((i) => [i.id, i.inwestor]));

  const wgInwestora = new Map();
  for (const faktura of stanFaktur) {
    if (faktura.typ !== 'sprzedaz') continue;
    if (faktura.stan !== 'oplacona' || faktura.dataDomkniecia == null) continue;
    const inwestor = inwestorWgInwestycji.get(faktura.idInwestycji);
    if (inwestor == null) continue;
    if (!wgInwestora.has(inwestor)) wgInwestora.set(inwestor, []);
    wgInwestora.get(inwestor).push(faktura.dataDomkniecia - faktura.terminPlatnosci);
  }

  const wszystkieOpoznienia = [...wgInwestora.values()].flat();
  const globalne = {
    n: wszystkieOpoznienia.length,
    p50: percentyl(wszystkieOpoznienia, 50),
    p75: percentyl(wszystkieOpoznienia, 75),
    p90: percentyl(wszystkieOpoznienia, 90),
  };

  const inwestorzy = [...wgInwestora.keys()].sort().map((inwestor) => {
    const opoznienia = wgInwestora.get(inwestor);
    const wystarczajaca = opoznienia.length >= minHistorii;
    return {
      inwestor,
      n: opoznienia.length,
      wystarczajacaHistoria: wystarczajaca,
      // Przy zbyt krotkiej historii percentyle sa null, nie "0 dni opoznienia".
      p50: wystarczajaca ? percentyl(opoznienia, 50) : null,
      p75: wystarczajaca ? percentyl(opoznienia, 75) : null,
      p90: wystarczajaca ? percentyl(opoznienia, 90) : null,
      najkrotsze: opoznienia.length > 0 ? Math.min(...opoznienia) : null,
      najdluzsze: opoznienia.length > 0 ? Math.max(...opoznienia) : null,
    };
  });

  // Inwestorzy, ktorzy maja otwarte faktury, ale zadnej domknietej — czyli zero historii.
  const zHistoria = new Set(wgInwestora.keys());
  const bezHistorii = [...new Set(stanInwestycji.map((i) => i.inwestor))]
    .filter((inwestor) => !zHistoria.has(inwestor))
    .sort();

  return { inwestorzy, bezHistorii, globalne, minHistorii };
}

function opoznienieDla(historia, inwestor, kluczScenariusza) {
  const wpis = historia.inwestorzy.find((i) => i.inwestor === inwestor);
  if (wpis && wpis[kluczScenariusza] != null) {
    return { dni: wpis[kluczScenariusza], zrodlo: 'historia_inwestora' };
  }
  if (historia.globalne[kluczScenariusza] != null && historia.globalne.n >= historia.minHistorii) {
    return { dni: historia.globalne[kluczScenariusza], zrodlo: 'historia_globalna' };
  }
  return { dni: 0, zrodlo: 'brak_historii' };
}

// Projekcja dla jednego scenariusza.
export function projekcja({ stanFaktur, stanInwestycji, historia, konfiguracja, kluczScenariusza }) {
  const { naDzien, saldoPoczatkowe, horyzontTygodni, minimalnaPoduszka } = konfiguracja;
  const inwestorWgInwestycji = new Map(stanInwestycji.map((i) => [i.id, i.inwestor]));

  const pierwszyTydzien = poczatekTygodnia(naDzien);
  const tygodnie = [];
  for (let i = 0; i < horyzontTygodni; i += 1) {
    tygodnie.push({
      poczatek: pierwszyTydzien + i * 7,
      wplywy: 0,
      wyplaty: 0,
      pozycjeWplywow: 0,
      pozycjeWyplat: 0,
      wplywyBezHistorii: 0,
    });
  }
  const ostatniDzien = pierwszyTydzien + horyzontTygodni * 7 - 1;

  const indeksTygodnia = (dzien) => Math.floor((poczatekTygodnia(dzien) - pierwszyTydzien) / 7);

  let poHoryzoncieWplywy = 0;
  let poHoryzoncieWyplaty = 0;
  let wplywyOgolem = 0;
  let wplywyZPokryciem = 0;

  for (const faktura of stanFaktur) {
    if (!faktura.otwarta) continue;

    if (faktura.typ === 'sprzedaz') {
      const inwestor = inwestorWgInwestycji.get(faktura.idInwestycji);
      const { dni, zrodlo } = opoznienieDla(historia, inwestor, kluczScenariusza);
      // Faktura juz przeterminowana nie wplynie "wstecz" — najwczesniej dzisiaj.
      const oczekiwany = Math.max(faktura.terminPlatnosci + dni, naDzien);

      wplywyOgolem += faktura.pozostalo;
      if (zrodlo === 'historia_inwestora') wplywyZPokryciem += faktura.pozostalo;

      if (oczekiwany > ostatniDzien) {
        poHoryzoncieWplywy += faktura.pozostalo;
        continue;
      }
      const tydzien = tygodnie[indeksTygodnia(oczekiwany)];
      tydzien.wplywy += faktura.pozostalo;
      tydzien.pozycjeWplywow += 1;
      if (zrodlo !== 'historia_inwestora') tydzien.wplywyBezHistorii += faktura.pozostalo;
    } else {
      // Zobowiazania wobec podwykonawcow stawiamy na termin. Zalozenie ostrozne:
      // wlasne platnosci robimy na czas, cudze moga sie spoznic.
      const oczekiwany = Math.max(faktura.terminPlatnosci, naDzien);
      if (oczekiwany > ostatniDzien) {
        poHoryzoncieWyplaty += faktura.pozostalo;
        continue;
      }
      const tydzien = tygodnie[indeksTygodnia(oczekiwany)];
      tydzien.wyplaty += faktura.pozostalo;
      tydzien.pozycjeWyplat += 1;
    }
  }

  let saldo = saldoPoczatkowe;
  let minimalneSaldo = saldoPoczatkowe;
  let tydzienMinimum = pierwszyTydzien;
  let pierwszyTydzienPonizejPoduszki = null;
  let pierwszyTydzienPonizejZera = null;

  for (const tydzien of tygodnie) {
    tydzien.saldoPoczatek = saldo;
    saldo = saldo + tydzien.wplywy - tydzien.wyplaty;
    tydzien.saldoKoniec = saldo;
    tydzien.ponizejPoduszki = minimalnaPoduszka != null && saldo < minimalnaPoduszka;
    tydzien.ponizejZera = saldo < 0;

    if (saldo < minimalneSaldo) {
      minimalneSaldo = saldo;
      tydzienMinimum = tydzien.poczatek;
    }
    if (pierwszyTydzienPonizejPoduszki == null && tydzien.ponizejPoduszki) {
      pierwszyTydzienPonizejPoduszki = tydzien.poczatek;
    }
    if (pierwszyTydzienPonizejZera == null && tydzien.ponizejZera) {
      pierwszyTydzienPonizejZera = tydzien.poczatek;
    }
  }

  return {
    scenariusz: kluczScenariusza,
    tygodnie,
    saldoKoncowe: saldo,
    minimalneSaldo,
    tydzienMinimum,
    pierwszyTydzienPonizejPoduszki,
    pierwszyTydzienPonizejZera,
    poHoryzoncieWplywy,
    poHoryzoncieWyplaty,
    // Jaka czesc prognozowanych wplywow opiera sie na historii TEGO inwestora,
    // a nie na sredniej z innych albo na golym terminie z faktury.
    pokrycieHistoria: safeDiv(wplywyZPokryciem, wplywyOgolem),
  };
}

// Wszystkie trzy scenariusze plus jawna lista zalozen.
export function projekcjaPelna({ stanFaktur, stanInwestycji, historia, konfiguracja }) {
  const scenariusze = {};
  for (const { klucz } of SCENARIUSZE) {
    scenariusze[klucz] = projekcja({
      stanFaktur,
      stanInwestycji,
      historia,
      konfiguracja,
      kluczScenariusza: klucz,
    });
  }

  const zalozenia = [
    'Wplyw od inwestora nastepuje w terminie z faktury powiekszonym o opoznienie z jego wlasnej historii wplat.',
    'Faktura juz przeterminowana wplywa najwczesniej w dniu sporzadzenia raportu, nigdy wstecz.',
    'Zobowiazania wobec podwykonawcow sa placone dokladnie w terminie z faktury.',
    'Kaucje gwarancyjne nie sa liczone jako wplyw, dopoki inwestycja nie ma statusu "zakonczona".',
    'Prognoza obejmuje wylacznie faktury juz wystawione. Roboty niezafakturowane nie generuja tu wplywu ani kosztu.',
    'Brak w projekcji: podatkow, wynagrodzen, rat leasingowych i kosztow stalych, bo one nie wynikaja z rejestru faktur.',
  ];

  const ostrzezenia = [];
  if (historia.bezHistorii.length > 0) {
    ostrzezenia.push(
      `Inwestorzy bez ani jednej domknietej faktury: ${historia.bezHistorii.join(', ')}. ` +
        'Dla nich prognoza opiera sie na sredniej z pozostalych inwestorow albo na golym terminie z faktury.',
    );
  }
  const zaKrotka = historia.inwestorzy.filter((i) => !i.wystarczajacaHistoria);
  if (zaKrotka.length > 0) {
    ostrzezenia.push(
      `Inwestorzy z historia krotsza niz ${historia.minHistorii} domkniete faktury: ` +
        `${zaKrotka.map((i) => `${i.inwestor} (${i.n})`).join(', ')}. Percentyle dla nich sa nieoznaczone.`,
    );
  }
  const pokrycie = scenariusze.p50.pokrycieHistoria;
  if (pokrycie != null && pokrycie < 0.5) {
    ostrzezenia.push(
      'Ponizej polowy prognozowanych wplywow ma pokrycie w historii konkretnego inwestora. ' +
        'Traktuj projekcje jako szkic, nie jako podstawe decyzji.',
    );
  }

  return { scenariusze, zalozenia, ostrzezenia, historia };
}
