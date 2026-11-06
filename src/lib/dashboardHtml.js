// Deterministyczny dashboard HTML z metrics.json.
//
// Jeden samodzielny plik: style w srodku, wykres jako inline SVG, zero zadan sieciowych i zero
// zaleznosci od internetu. Wlasciciel firmy ma go otworzyc z zalacznika w mailu na telefonie,
// w aucie pod budowa, bez logowania sie do czegokolwiek.
//
// Przelaczanie scenariuszy dziala na samym CSS (ukryte inputy radio), bez JavaScriptu —
// dzieki temu strona zachowuje sie tak samo w podgladzie poczty, ktory skrypty wycina.

import { formatPLN, formatProcent } from './liczby.js';
import { formatData } from './daty.js';
import { SCENARIUSZE } from './cashflow.js';
import { PRZEDZIALY_WIEKOWANIA } from './faktury.js';

function esc(wartosc) {
  return String(wartosc)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ETYKIETY_PRZEDZIALOW = {
  biezaca: 'Termin przed nami',
  '1-30': 'Po terminie 1-30 dni',
  '31-60': 'Po terminie 31-60 dni',
  '61-90': 'Po terminie 61-90 dni',
  '90+': 'Po terminie ponad 90 dni',
};

const ETYKIETY_STANU = {
  oplacona: 'Opłacona',
  czesciowo: 'Częściowo',
  nieoplacona: 'Nieopłacona',
};

const ETYKIETY_STATUSU = {
  w_przygotowaniu: 'W przygotowaniu',
  w_trakcie: 'W trakcie',
  zakonczona: 'Zakończona',
};

// --- wykres tygodniowy -----------------------------------------------------

function wykresTygodniowy(scenariusz, konfiguracja) {
  const tygodnie = scenariusz.tygodnie;
  const szerokosc = 760;
  const wysokosc = 260;
  const marginesL = 8;
  const marginesP = 8;
  const marginesG = 16;
  const marginesD = 42;
  const polePlot = wysokosc - marginesG - marginesD;
  const szerokoscPlot = szerokosc - marginesL - marginesP;
  const szerokoscSlupka = szerokoscPlot / tygodnie.length;

  const salda = tygodnie.map((t) => t.saldoKoniec);
  const poduszka = konfiguracja.minimalnaPoduszka ?? 0;
  const maks = Math.max(...salda, poduszka, 0);
  const min = Math.min(...salda, 0);
  const zakres = maks - min || 1;

  const y = (wartosc) => marginesG + polePlot - ((wartosc - min) / zakres) * polePlot;
  const yZero = y(0);

  const slupki = tygodnie
    .map((tydzien, index) => {
      const x = marginesL + index * szerokoscSlupka + szerokoscSlupka * 0.14;
      const w = szerokoscSlupka * 0.72;
      const yWartosc = y(tydzien.saldoKoniec);
      const gora = Math.min(yWartosc, yZero);
      const h = Math.max(Math.abs(yWartosc - yZero), 1.5);
      const klasa = tydzien.ponizejZera
        ? 'slupek ujemny'
        : tydzien.ponizejPoduszki
          ? 'slupek ostrzezenie'
          : 'slupek';
      return `<rect class="${klasa}" x="${x.toFixed(1)}" y="${gora.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"><title>${esc(formatData(tydzien.poczatek))}: ${esc(formatPLN(tydzien.saldoKoniec))}</title></rect>`;
    })
    .join('');

  const etykiety = tygodnie
    .map((tydzien, index) => {
      // Na waskim ekranie co druga etykieta, zeby sie nie zlewaly.
      const co2 = index % 2 === 0;
      const x = marginesL + index * szerokoscSlupka + szerokoscSlupka / 2;
      const data = formatData(tydzien.poczatek).slice(5).replace('-', '.');
      return `<text class="os-x${co2 ? '' : ' rzadka'}" x="${x.toFixed(1)}" y="${(wysokosc - marginesD + 16).toFixed(1)}">${esc(data)}</text>`;
    })
    .join('');

  const liniaPoduszki =
    konfiguracja.minimalnaPoduszka != null
      ? `<line class="linia-poduszka" x1="${marginesL}" y1="${y(poduszka).toFixed(1)}" x2="${szerokosc - marginesP}" y2="${y(poduszka).toFixed(1)}"></line>
         <text class="etykieta-linii" x="${szerokosc - marginesP}" y="${(y(poduszka) - 5).toFixed(1)}" text-anchor="end">poduszka ${esc(formatPLN(poduszka))}</text>`
      : '';

  return `<svg class="wykres" viewBox="0 0 ${szerokosc} ${wysokosc}" role="img" preserveAspectRatio="xMidYMid meet" aria-label="Prognozowane saldo na koniec kazdego tygodnia">
    ${slupki}
    <line class="linia-zero" x1="${marginesL}" y1="${yZero.toFixed(1)}" x2="${szerokosc - marginesP}" y2="${yZero.toFixed(1)}"></line>
    ${liniaPoduszki}
    ${etykiety}
  </svg>`;
}

function panelScenariusza(metryki, definicja) {
  const scenariusz = metryki.prognoza.scenariusze[definicja.klucz];
  const tygodniePonizejZera = scenariusz.tygodnie.filter((t) => t.ponizejZera).length;
  const tygodniePonizejPoduszki = scenariusz.tygodnie.filter((t) => t.ponizejPoduszki).length;

  const wierszeTabeli = scenariusz.tygodnie
    .map((tydzien) => {
      const klasa = tydzien.ponizejZera ? ' class="zla"' : tydzien.ponizejPoduszki ? ' class="uwaga"' : '';
      return `<tr${klasa}>
        <td>${esc(formatData(tydzien.poczatek))}</td>
        <td class="num">${tydzien.wplywy === 0 ? '<span class="pusto">-</span>' : esc(formatPLN(tydzien.wplywy, { waluta: false }))}</td>
        <td class="num">${tydzien.wyplaty === 0 ? '<span class="pusto">-</span>' : esc(formatPLN(tydzien.wyplaty, { waluta: false }))}</td>
        <td class="num mocna">${esc(formatPLN(tydzien.saldoKoniec, { waluta: false }))}</td>
      </tr>`;
    })
    .join('');

  return `<div class="panel-scenariusza" id="panel-${definicja.klucz}">
    <p class="opis-scenariusza">${esc(definicja.opis)}</p>
    <div class="fakty">
      <div class="fakt">
        <div class="fakt-num ${scenariusz.minimalneSaldo < 0 ? 'zly' : ''}">${esc(formatPLN(scenariusz.minimalneSaldo))}</div>
        <div class="fakt-opis">Najnizsze saldo w horyzoncie, tydzien ${esc(formatData(scenariusz.tydzienMinimum))}</div>
      </div>
      <div class="fakt">
        <div class="fakt-num ${tygodniePonizejZera > 0 ? 'zly' : ''}">${tygodniePonizejZera}</div>
        <div class="fakt-opis">Tygodni z saldem ponizej zera</div>
      </div>
      <div class="fakt">
        <div class="fakt-num ${tygodniePonizejPoduszki > 0 ? 'uwazny' : ''}">${tygodniePonizejPoduszki}</div>
        <div class="fakt-opis">Tygodni ponizej poduszki</div>
      </div>
      <div class="fakt">
        <div class="fakt-num ${scenariusz.pokrycieHistoria == null ? 'brak' : ''}">${esc(formatProcent(scenariusz.pokrycieHistoria))}</div>
        <div class="fakt-opis">Wplywow opartych na historii tego inwestora</div>
      </div>
    </div>
    ${wykresTygodniowy(scenariusz, metryki.konfiguracja)}
    <div class="scroll-x">
      <table class="tabela-tygodni">
        <thead><tr><th>Tydzien od</th><th class="num">Wplywy</th><th class="num">Wyplaty</th><th class="num">Saldo na koniec</th></tr></thead>
        <tbody>${wierszeTabeli}</tbody>
      </table>
    </div>${
      scenariusz.poHoryzoncieWplywy > 0
        ? `\n    <p class="przypis">Poza horyzontem ${metryki.konfiguracja.horyzontTygodni} tygodni zostaje jeszcze ${esc(formatPLN(scenariusz.poHoryzoncieWplywy))} naleznosci. Te pieniadze istnieja, ale nie pomoga w zadnym z tygodni powyzej.</p>`
        : ''
    }
  </div>`;
}

// --- sekcje ----------------------------------------------------------------

function sekcjaKafelki(metryki) {
  const p = metryki.podsumowanie;
  const kafelek = (wartosc, opis, klasa = '') =>
    `<div class="kafelek"><div class="kafelek-num ${klasa}">${esc(wartosc)}</div><div class="kafelek-opis">${esc(opis)}</div></div>`;

  return `<div class="kafelki">
    ${kafelek(formatPLN(p.naleznosci), 'Naleznosci otwarte')}
    ${kafelek(formatPLN(p.naleznosciPrzeterminowane), `Po terminie (${p.liczbaPrzeterminowanychNaleznosci} faktur)`, p.naleznosciPrzeterminowane > 0 ? 'zly' : '')}
    ${kafelek(formatPLN(p.zobowiazania), 'Zobowiazania wobec podwykonawcow')}
    ${kafelek(formatPLN(p.zobowiazaniaPrzeterminowane), `Po terminie (${p.liczbaPrzeterminowanychZobowiazan} faktur)`, p.zobowiazaniaPrzeterminowane > 0 ? 'uwazny' : '')}
    ${kafelek(formatPLN(p.kaucjeZatrzymane), 'Kaucje zatrzymane do odbioru')}
    ${kafelek(formatPLN(p.saldoPoczatkowe), 'Saldo na dzien raportu')}
  </div>`;
}

function sekcjaWiekowanie(metryki) {
  const wiersze = PRZEDZIALY_WIEKOWANIA.map((przedzial) => {
    const w = metryki.podsumowanie.wiekowanie[przedzial];
    if (w.liczbaNaleznosci === 0 && w.liczbaZobowiazan === 0) return '';
    const zly = przedzial !== 'biezaca';
    return `<tr${zly && w.naleznosci > 0 ? ' class="zla"' : ''}>
      <td>${esc(ETYKIETY_PRZEDZIALOW[przedzial])}</td>
      <td class="num">${w.liczbaNaleznosci === 0 ? '<span class="pusto">-</span>' : esc(formatPLN(w.naleznosci, { waluta: false }))}</td>
      <td class="num male">${w.liczbaNaleznosci || '<span class="pusto">-</span>'}</td>
      <td class="num">${w.liczbaZobowiazan === 0 ? '<span class="pusto">-</span>' : esc(formatPLN(w.zobowiazania, { waluta: false }))}</td>
      <td class="num male">${w.liczbaZobowiazan || '<span class="pusto">-</span>'}</td>
    </tr>`;
  }).join('');

  return `<div class="scroll-x"><table>
    <thead><tr><th>Przedzial</th><th class="num">Naleznosci</th><th class="num male">szt.</th><th class="num">Zobowiazania</th><th class="num male">szt.</th></tr></thead>
    <tbody>${wiersze}</tbody>
  </table></div>`;
}

function sekcjaInwestycje(metryki) {
  const wiersze = metryki.inwestycje
    .map((i) => {
      const postep = i.wartoscKontraktu > 0 ? i.zafakturowano / i.wartoscKontraktu : null;
      return `<tr>
      <td>
        <div class="nazwa">${esc(i.nazwa)}</div>
        <div class="podpis">${esc(i.inwestor)} &middot; ${esc(i.etap)}</div>
      </td>
      <td><span class="znacznik znacznik-${esc(i.status)}">${esc(ETYKIETY_STATUSU[i.status] ?? i.status)}</span></td>
      <td class="num">${esc(formatPLN(i.wartoscKontraktu, { waluta: false }))}</td>
      <td class="num">
        ${esc(formatProcent(postep))}
        <div class="pasek"><span style="width:${Math.min(Math.max((postep ?? 0) * 100, 0), 100).toFixed(1)}%"></span></div>
      </td>
      <td class="num">${i.naleznosci === 0 ? '<span class="pusto">-</span>' : esc(formatPLN(i.naleznosci, { waluta: false }))}</td>
      <td class="num${i.naleznosciPrzeterminowane > 0 ? ' zly-tekst' : ''}">${
        i.naleznosciPrzeterminowane === 0
          ? '<span class="pusto">-</span>'
          : `${esc(formatPLN(i.naleznosciPrzeterminowane, { waluta: false }))}<div class="podpis">${i.najstarszaZaleglosc} dni</div>`
      }</td>
      <td class="num">${i.zobowiazania === 0 ? '<span class="pusto">-</span>' : esc(formatPLN(i.zobowiazania, { waluta: false }))}</td>
      <td class="num">${esc(formatPLN(i.kaucja, { waluta: false }))}</td>
    </tr>`;
    })
    .join('');

  return `<div class="scroll-x"><table>
    <thead><tr>
      <th>Inwestycja</th><th>Status</th><th class="num">Kontrakt</th><th class="num">Zafakturowano</th>
      <th class="num">Naleznosci</th><th class="num">Po terminie</th><th class="num">Zobowiazania</th><th class="num">Kaucja</th>
    </tr></thead>
    <tbody>${wiersze}</tbody>
  </table></div>`;
}

function sekcjaFaktury(metryki, { tylkoOtwarte = true, limit = 20 } = {}) {
  const faktury = metryki.faktury
    .filter((f) => (tylkoOtwarte ? f.otwarta : true))
    .sort((a, b) => a.terminPlatnosci - b.terminPlatnosci)
    .slice(0, limit);

  const nazwyInwestycji = new Map(metryki.inwestycje.map((i) => [i.id, i.nazwa]));

  const wiersze = faktury
    .map((f) => {
      const opisTerminu = f.przeterminowana
        ? `<span class="zly-tekst">${f.dniPoTerminie} dni po terminie</span>`
        : f.dniDoTerminu === 0
          ? '<span class="uwazny-tekst">dzis</span>'
          : `za ${f.dniDoTerminu} dni`;
      return `<tr${f.przeterminowana ? ' class="zla"' : ''}>
      <td><div class="nazwa mono">${esc(f.id)}</div><div class="podpis">${esc(nazwyInwestycji.get(f.idInwestycji) ?? f.idInwestycji)}</div></td>
      <td><span class="znacznik znacznik-${esc(f.typ)}">${f.typ === 'sprzedaz' ? 'Do nas' : 'Od nas'}</span></td>
      <td>${esc(f.kontrahent)}</td>
      <td>${esc(formatData(f.terminPlatnosci))}<div class="podpis">${opisTerminu}</div></td>
      <td class="num">${esc(formatPLN(f.kwotaBrutto, { waluta: false }))}</td>
      <td class="num mocna">${esc(formatPLN(f.pozostalo, { waluta: false }))}</td>
      <td><span class="znacznik znacznik-${esc(f.stan)}">${esc(ETYKIETY_STANU[f.stan] ?? f.stan)}</span></td>
    </tr>`;
    })
    .join('');

  return `<div class="scroll-x"><table>
    <thead><tr><th>Faktura</th><th>Kierunek</th><th>Kontrahent</th><th>Termin</th><th class="num">Kwota</th><th class="num">Pozostalo</th><th>Stan</th></tr></thead>
    <tbody>${wiersze}</tbody>
  </table></div>`;
}

function sekcjaHistoria(metryki) {
  const h = metryki.prognoza.historia;
  const wiersze = h.inwestorzy
    .map((i) => {
      const naDni = (v) => (v == null ? '<span class="pusto">N/A</span>' : `${v > 0 ? '+' : ''}${v} dni`);
      return `<tr${i.wystarczajacaHistoria ? '' : ' class="uwaga"'}>
      <td>${esc(i.inwestor)}</td>
      <td class="num male">${i.n}</td>
      <td class="num">${naDni(i.p50)}</td>
      <td class="num">${naDni(i.p75)}</td>
      <td class="num">${naDni(i.p90)}</td>
      <td class="num male">${i.najkrotsze == null ? '<span class="pusto">-</span>' : `${i.najkrotsze > 0 ? '+' : ''}${i.najkrotsze} do ${i.najdluzsze > 0 ? '+' : ''}${i.najdluzsze}`}</td>
    </tr>`;
    })
    .join('');

  return `<div class="scroll-x"><table>
    <thead><tr><th>Inwestor</th><th class="num male">Domknietych faktur</th><th class="num">Typowo</th><th class="num">Ostroznie</th><th class="num">Pesymistycznie</th><th class="num male">Zakres</th></tr></thead>
    <tbody>${wiersze}</tbody>
  </table>
  </div>
  <p class="przypis">Opoznienie liczone jako dzien ostatniej wplaty minus termin z faktury, wylacznie dla faktur domknietych do zera.
  Przy historii krotszej niz ${h.minHistorii} domkniete faktury percentyle sa nieoznaczone (N/A) i prognoza dla takiego inwestora korzysta ze sredniej z pozostalych.
  Nieoznaczone znaczy nieoznaczone, nie zero.</p>`;
}

// --- calosc ----------------------------------------------------------------

export function renderDashboard(metryki) {
  const p = metryki.podsumowanie;
  const przelaczniki = SCENARIUSZE.map(
    (s, index) =>
      `<input type="radio" name="scenariusz" id="scen-${s.klucz}" class="przelacznik"${index === 0 ? ' checked' : ''}>`,
  ).join('');
  const etykietyPrzelacznikow = SCENARIUSZE.map(
    (s) => `<label for="scen-${s.klucz}" class="etykieta-scenariusza">${esc(s.etykieta)}</label>`,
  ).join('');
  const panele = SCENARIUSZE.map((s) => panelScenariusza(metryki, s)).join('');

  const ostrzezenia = metryki.prognoza.ostrzezenia
    .map((o) => `<li>${esc(o)}</li>`)
    .join('');
  const zalozenia = metryki.prognoza.zalozenia.map((z) => `<li>${esc(z)}</li>`).join('');

  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kontrola faktur i gotowki: ${esc(metryki.firma)}</title>
<style>
:root {
  --tlo: #f6f5f2;
  --karta: #ffffff;
  --tekst: #16181d;
  --przygaszony: #5f6672;
  --slaby: #9aa1ad;
  --linia: #e2e4e8;
  --linia-mocna: #c6cad1;
  --akcent: #1f2937;
  --zly: #b3261e;
  --zly-tlo: #fdf2f1;
  --uwazny: #8a5a00;
  --uwazny-tlo: #fdf8ee;
  --dobry: #1f6a3f;
}
@media (prefers-color-scheme: dark) {
  :root {
    --tlo: #14161a;
    --karta: #1b1e24;
    --tekst: #e9ecf1;
    --przygaszony: #a3abb8;
    --slaby: #6b7280;
    --linia: #2a2e36;
    --linia-mocna: #3d434d;
    --akcent: #e9ecf1;
    --zly: #f0857c;
    --zly-tlo: #2a1a19;
    --uwazny: #e0b25e;
    --uwazny-tlo: #2a2318;
    --dobry: #6bbf8a;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--tlo);
  color: var(--tekst);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 15px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  -webkit-text-size-adjust: 100%;
}
.strona { max-width: 1080px; margin: 0 auto; padding: 20px 16px 56px; }
header { margin-bottom: 20px; }
.nadtytul { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--przygaszony); }
h1 { font-size: 22px; line-height: 1.2; margin: 4px 0 2px; font-weight: 650; }
.stan-na { color: var(--przygaszony); font-size: 13px; }
h2 { font-size: 13px; letter-spacing: .07em; text-transform: uppercase; color: var(--przygaszony); font-weight: 600; margin: 32px 0 10px; }
h2:first-of-type { margin-top: 24px; }
section { background: var(--karta); border: 1px solid var(--linia); border-radius: 10px; padding: 14px 16px; }

.kafelki { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1px; background: var(--linia); border: 1px solid var(--linia); border-radius: 10px; overflow: hidden; }
.kafelek { background: var(--karta); padding: 12px 14px; }
.kafelek-num { font-size: 18px; font-weight: 600; letter-spacing: -.01em; }
.kafelek-opis { font-size: 12px; color: var(--przygaszony); margin-top: 2px; }

.fakty { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 12px 0 4px; }
.fakt-num { font-size: 20px; font-weight: 650; }
.fakt-opis { font-size: 12px; color: var(--przygaszony); }
.zly, .zly-tekst { color: var(--zly); }
.uwazny, .uwazny-tekst { color: var(--uwazny); }
.brak { color: var(--slaby); font-weight: 400; }
.pusto { color: var(--slaby); }

.przelacznik { position: absolute; opacity: 0; pointer-events: none; }
.paski-scenariuszy { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.etykieta-scenariusza { font-size: 13px; padding: 6px 12px; border: 1px solid var(--linia-mocna); border-radius: 999px; cursor: pointer; color: var(--przygaszony); user-select: none; }
.panel-scenariusza { display: none; }
#scen-p50:checked ~ .paski-scenariuszy label[for="scen-p50"],
#scen-p75:checked ~ .paski-scenariuszy label[for="scen-p75"],
#scen-p90:checked ~ .paski-scenariuszy label[for="scen-p90"] { background: var(--akcent); color: var(--karta); border-color: var(--akcent); }
#scen-p50:checked ~ #panel-p50,
#scen-p75:checked ~ #panel-p75,
#scen-p90:checked ~ #panel-p90 { display: block; }
.opis-scenariusza { font-size: 13px; color: var(--przygaszony); margin: 8px 0 0; }

.wykres { width: 100%; height: auto; margin: 12px 0 4px; display: block; }
.slupek { fill: var(--akcent); }
.slupek.ostrzezenie { fill: var(--uwazny); }
.slupek.ujemny { fill: var(--zly); }
.linia-zero { stroke: var(--linia-mocna); stroke-width: 1.5; }
.linia-poduszka { stroke: var(--uwazny); stroke-width: 1; stroke-dasharray: 4 4; }
.etykieta-linii { font-size: 11px; fill: var(--uwazny); font-family: inherit; }
.os-x { font-size: 11px; fill: var(--przygaszony); text-anchor: middle; font-family: inherit; }
.os-x.rzadka { display: none; }
@media (min-width: 680px) { .os-x.rzadka { display: block; } }

.scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -16px; padding: 0 16px; }
table { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 560px; }
th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--linia); vertical-align: top; }
th { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--przygaszony); font-weight: 600; border-bottom: 1.5px solid var(--linia-mocna); white-space: nowrap; }
td.num, th.num { text-align: right; white-space: nowrap; }
.male { font-size: 12px; color: var(--przygaszony); }
.mocna { font-weight: 600; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; }
.nazwa { font-weight: 550; }
.podpis { font-size: 11.5px; color: var(--przygaszony); margin-top: 1px; }
tr.zla { background: var(--zly-tlo); }
tr.uwaga { background: var(--uwazny-tlo); }
tbody tr:last-child td { border-bottom: 0; }

.znacznik { display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--linia-mocna); color: var(--przygaszony); white-space: nowrap; }
.znacznik-w_trakcie { border-color: var(--dobry); color: var(--dobry); }
.znacznik-w_przygotowaniu { border-color: var(--uwazny); color: var(--uwazny); }
.znacznik-nieoplacona { border-color: var(--zly); color: var(--zly); }
.znacznik-czesciowo { border-color: var(--uwazny); color: var(--uwazny); }

.pasek { height: 4px; background: var(--linia); border-radius: 2px; margin-top: 4px; overflow: hidden; }
.pasek span { display: block; height: 4px; background: var(--przygaszony); }

.przypis { font-size: 12.5px; color: var(--przygaszony); margin: 10px 0 0; }
ul.lista { margin: 6px 0 0; padding-left: 20px; font-size: 13.5px; color: var(--przygaszony); }
ul.lista li { margin: 5px 0; }
section.uwagi { border-left: 3px solid var(--uwazny); }
footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid var(--linia); font-size: 12px; color: var(--slaby); }
footer p { margin: 3px 0; }
</style>
</head>
<body>
<div class="strona">

<header>
  <div class="nadtytul">Kontrola faktur i przeplywow</div>
  <h1>${esc(metryki.firma)}</h1>
  <div class="stan-na">Stan na ${esc(formatData(p.naDzien))} &middot; ${p.liczbaInwestycji} inwestycji &middot; ${p.liczbaFaktur} faktur</div>
</header>

${sekcjaKafelki(metryki)}

<h2>Kiedy zabraknie gotowki</h2>
<section>
  ${przelaczniki}
  <div class="paski-scenariuszy">${etykietyPrzelacznikow}</div>
  ${panele}
  <p class="przypis"><strong>To narzedzie nie mowi, czy zaczac kolejna inwestycje.</strong>
  Pokazuje, w ktorym tygodniu i o ile saldo schodzi ponizej poduszki przy trzech scenariuszach
  zachowania inwestorow, i na czym to policzono. Reszte wiesz Ty: obietnice z telefonow,
  zaawansowanie robot, dostepna linia kredytowa. Tego nie ma w zadnym arkuszu.</p>
</section>

<h2>Na czym oparta jest prognoza</h2>
<section>
  ${sekcjaHistoria(metryki)}
</section>

${
  ostrzezenia
    ? `<h2>Czego ta prognoza nie wie</h2><section class="uwagi"><ul class="lista">${ostrzezenia}</ul></section>`
    : ''
}

<h2>Wiekowanie naleznosci i zobowiazan</h2>
<section>
  ${sekcjaWiekowanie(metryki)}
</section>

<h2>Inwestycje</h2>
<section>
  ${sekcjaInwestycje(metryki)}
</section>

<h2>Faktury otwarte, najpilniejsze u gory</h2>
<section>
  ${sekcjaFaktury(metryki)}
</section>

<h2>Zalozenia</h2>
<section>
  <ul class="lista">${zalozenia}</ul>
</section>

<footer>
  <p>Raport wygenerowany deterministycznie z rejestru faktur i wyciagu platnosci. Te same wejscia zawsze daja ten sam wynik.</p>
  <p>Dane w tym pliku sa w calosci syntetyczne. Zadna nazwa nie odnosi sie do istniejacej firmy ani osoby.</p>
</footer>

</div>
</body>
</html>
`;
}
