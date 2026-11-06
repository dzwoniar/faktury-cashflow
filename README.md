# Faktury i luka gotówkowa

Kontrola faktur i przepływów dla firmy prowadzącej **wiele inwestycji równocześnie** (budownictwo,
remonty, wykończenia). Excel na wejściu, jeden samodzielny plik HTML na wyjściu.

> **Status:** demo na danych syntetycznych. Silnik i testy są prawdziwe, dane w `fixtures/` są
> w całości zmyślone. Nie jest to gotowy produkt ani wdrożenie u klienta.

**[Otwórz przykładowy dashboard](https://dzwoniar.github.io/faktury-cashflow/)**. Przełącz scenariusz przepływów i sprawdź, które faktury są po terminie. Dane syntetyczne.

Odpowiada na cztery pytania, których nie widać w arkuszu z 300 wierszami:

1. Które faktury są po terminie i od ilu dni.
2. Ile realnie zostało do zapłaty na każdej inwestycji, po odjęciu wpłat częściowych.
3. Kiedy zabraknie gotówki, jeśli inwestorzy zapłacą tak, jak płacili do tej pory.
4. Na ile tej prognozie w ogóle można wierzyć.

---

## Jak to działa (3 skrypty, zero zależności)

```
inwestycje.csv + faktury.csv + platnosci.csv + konfiguracja.json
        │
   node src/validate.mjs   → schemat, spójność, dane wrażliwe → OK albo NEEDS_REVIEW
        │
   node src/metrics.mjs    → deterministyczne liczby  →  metrics.json
        │
   node src/render.mjs     → dashboard.html (jeden plik, offline)
```

Node ≥ 22. Bez `npm install`, wszystko na standardowej bibliotece Node.

```bash
node src/validate.mjs fixtures/demo-remonty
```
```bash
node src/metrics.mjs fixtures/demo-remonty && node src/render.mjs output/demo-remonty
```
```bash
node --test
```

Otwórz `output/demo-remonty/dashboard.html` w przeglądarce. Plik jest samodzielny: style w środku,
wykres jako inline SVG, zero JavaScriptu, zero żądań sieciowych. Działa z załącznika w mailu,
na telefonie, bez internetu.

Żeby zobaczyć, jak import odmawia zamiast zgadywać:

```bash
node src/validate.mjs fixtures/demo-brudny
```

---

## Trzy decyzje, na których stoi całość

**1. Faktura i płatność to dwa osobne źródła.**
Rejestr faktur (KSeF, program księgowy, eksport z Excela) mówi, ile i do kiedy. Wyciąg bankowy mówi,
czy i kiedy wpłynęło. Kolumna „opłacone: tak/nie" prowadzona ręcznie w arkuszu jest deklaracją,
nie faktem, i rozjeżdża się z rzeczywistością dokładnie wtedy, gdy jest najbardziej potrzebna.
Tutaj stan faktury **wynika** z dopasowanych wpłat i nie da się go nadpisać ręcznie.

**2. Kwoty w groszach, jako liczby całkowite.**
Złotówki w zmiennoprzecinkowych kumulują błąd przy sumowaniu setek faktur
(`0.1 + 0.2 === 0.30000000000000004`). Suma w raporcie ma się zgadzać z wyciągiem co do grosza.

**3. Przy niepewności system odmawia zamiast zgadywać.**
Źle policzony termin płatności jest gorszy niż brak wyniku, bo brak wyniku widać od razu,
a zła liczba wygląda identycznie jak dobra.

---

## Czego silnik pilnuje

- **Daty jednoznaczne albo żadne.** `15.03.2026` przechodzi. `03/04/2026` jest odrzucane, bo może
  znaczyć 3 kwietnia albo 4 marca, a różnica to miesiąc w terminie płatności.
- **Kwoty z Excela.** Spacja, spacja nierozdzielająca, przecinek, kropka, sufiks `zł`, zapis
  księgowy `(1 234,56)`. Kropka i przecinek jednocześnie (`1.234,56`) są odrzucane jako niejednoznaczne.
- **Uczciwe N/A.** Dzielenie bez mianownika daje `N/A`, nigdy `NaN`, `∞` ani zmyślonego `0%`.
- **Prognoza tylko z pokryciem.** Percentyle opóźnień liczone są wyłącznie z faktur domkniętych
  do zera. Przy historii krótszej niż 3 domknięte faktury percentyle są `null`, a raport mówi wprost,
  którego inwestora to dotyczy. Brak historii to brak historii, nie zerowe opóźnienie.
- **Stan wiedzy z dnia raportu.** Wpłaty z datą późniejszą niż `na_dzien` są pomijane. Raport
  na 30 czerwca pokazuje to, co było wiadomo 30 czerwca.
- **Spójność między plikami.** Faktura wskazująca nieistniejącą inwestycję, wpłata do nieistniejącej
  faktury, duplikat numeru faktury, termin przed datą wystawienia, każde blokuje liczenie.
- **Dane wrażliwe.** Numer konta, PESEL, e-mail czy telefon w pliku wejściowym są odrzucane.
  Do policzenia terminów są niepotrzebne, a podnoszą szkodę przy wycieku.
- **Determinizm.** Te same wejścia → bit-identyczny `metrics.json` i `dashboard.html`. Bez znacznika
  czasu, bez `Intl` zależnego od wersji ICU, bez AI w ścieżce liczb.

## Czego to narzędzie świadomie NIE robi

Nie zwraca werdyktu „możesz / nie możesz zacząć kolejnej inwestycji". Pokazuje, w którym tygodniu
i o ile saldo schodzi poniżej poduszki przy trzech scenariuszach zachowania inwestorów, wypisuje
założenia, na których to policzono, i podaje, jaka część prognozy ma pokrycie w historii konkretnego
inwestora. Decyzja zostaje po stronie właściciela, bo to on zna rzeczy, których nie ma w żadnym
arkuszu: obietnice z telefonów, zaawansowanie robót, dostępną linię kredytową.

W projekcji nie ma też podatków, wynagrodzeń, rat leasingowych ani kosztów stałych, one nie wynikają
z rejestru faktur. Pełna lista założeń jest na dole każdego wygenerowanego dashboardu.

---

## Struktura

```
src/
  validate.mjs            # życzliwe drzwi wejściowe: zbiera WSZYSTKIE błędy naraz
  metrics.mjs             # deterministyczne liczby -> metrics.json
  render.mjs              # metrics.json -> dashboard.html
  lib/
    csv.js                # parser RFC4180 (BOM, cudzysłowy) + wykrywanie separatora
    liczby.js             # kwoty w groszach, safeDiv (N/A), percentyle, format PL
    daty.js               # daty jako numer dnia UTC, parsowanie tylko formatów jednoznacznych
    schema.js             # nagłówki, słowniki, duplikaty, kolumny wrażliwe
    wejscie.js            # wczytanie + walidacja spójności między plikami
    faktury.js            # dopasowanie wpłat, stany, wiekowanie, agregaty per inwestycja
    cashflow.js           # percentyle opóźnień, projekcja tygodniowa, założenia
    dashboardHtml.js      # deterministyczny HTML, style w środku, SVG bez JS
fixtures/
  demo-remonty/           # 8 inwestycji, 35 faktur, 18 wpłat, dane w pełni syntetyczne
  demo-brudny/            # celowo popsuty zestaw do pokazania NEEDS_REVIEW
test/                     # 61 testów (node --test)
docs/index.html           # przykładowy dashboard opublikowany w GitHub Pages
output/                   # wyniki generowane lokalnie
```

### Schematy wejść

| Plik | Kolumny |
|---|---|
| `inwestycje.csv` | `id_inwestycji; nazwa; inwestor; etap; data_startu; wartosc_kontraktu; kaucja_proc; status` |
| `faktury.csv` | `id_faktury; id_inwestycji; typ; kontrahent; data_wystawienia; termin_platnosci; kwota_brutto` |
| `platnosci.csv` | `id_platnosci; id_faktury; data; kwota` |

`typ`: `sprzedaz` (faktura do inwestora, pieniądze do nas) albo `zakup` (faktura od podwykonawcy).
`status`: `w_przygotowaniu`, `w_trakcie`, `zakonczona`.

---

## Pochodzenie

Warstwa wejściowa (`lib/csv.js`, wzorzec `safeDiv` z uczciwym `N/A`, układ
`validate → metrics → render`, filozofia `NEEDS_REVIEW`) pochodzi z
`01-PRODUKTY/raport-kliencki-pl`. Nowe względem tamtego: kwoty w groszach, parsowanie dat tylko
w formatach jednoznacznych, wykrywanie separatora CSV, dopasowanie wpłat do faktur, wiekowanie,
percentyle opóźnień per kontrahent i projekcja tygodniowa.

## Weryfikacja

```bash
node --check src/*.mjs src/lib/*.js
```
```bash
node --test
```
```bash
node src/metrics.mjs fixtures/demo-remonty && node src/metrics.mjs fixtures/demo-remonty
```
Trzecia komenda uruchomiona dwa razy musi dać bit-identyczny `metrics.json`.

## Wersja portfolio i walidacja

Repozytorium zawiera kod oraz syntetyczne zestawy demonstracyjne. Realne arkusze, raporty, cache wdrożeń, screeny i materiały klienta nie są częścią publikacji. Publiczny dashboard powstaje z `fixtures/demo-remonty`. Aby go odtworzyć, uruchom `npm run demo` i skopiuj `output/demo-remonty/dashboard.html` do `docs/index.html`. CI uruchamia istniejące testy na Node 24, bez zależności npm i bez sekretów. Ta publikacja kodu nie potwierdza bezpieczeństwa dowolnych zewnętrznych danych wejściowych ani gotowości produktu do wdrożenia.
