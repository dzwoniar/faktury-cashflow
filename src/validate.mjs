// validate.mjs — sprawdza wejscia ZANIM cokolwiek policzymy.
// Uzycie: node src/validate.mjs <katalog-wejsc>

import { wczytajWejscia } from './lib/wejscie.js';

async function main() {
  const katalog = process.argv[2];
  if (!katalog) {
    console.error('Podaj katalog wejsc, np. `node src/validate.mjs fixtures/demo-remonty`.');
    process.exitCode = 1;
    return;
  }

  const { inwestycje, faktury, platnosci, bledy, ostrzezenia } = await wczytajWejscia(katalog);

  if (ostrzezenia.length > 0) {
    console.log('OSTRZEZENIA:');
    ostrzezenia.forEach((o) => console.log(`  ! ${o}`));
    console.log('');
  }

  if (bledy.length > 0) {
    console.error(`NEEDS_REVIEW — ${bledy.length} blad(ow). Liczenie zablokowane:`);
    bledy.forEach((b) => console.error(`  x ${b}`));
    console.error('');
    console.error('Zadna liczba nie zostala policzona. Popraw powyzsze i uruchom ponownie.');
    process.exitCode = 1;
    return;
  }

  console.log(
    `OK — wejscia poprawne. Inwestycji: ${inwestycje.length}, faktur: ${faktury.length}, ` +
      `wplat: ${platnosci.length}.`,
  );
  console.log(`Nastepny krok: node src/metrics.mjs ${katalog}`);
}

main();
