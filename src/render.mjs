// render.mjs, metrics.json => dashboard.html (jeden samodzielny plik).
// Uzycie: node src/render.mjs <katalog-wyjsciowy>

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderDashboard } from './lib/dashboardHtml.js';

async function main() {
  const katalog = process.argv[2];
  if (!katalog) {
    console.error('Podaj katalog wyjsciowy, np. `node src/render.mjs output/demo-remonty`.');
    process.exitCode = 1;
    return;
  }

  const sciezkaMetryk = path.join(katalog, 'metrics.json');
  let metryki;
  try {
    metryki = JSON.parse(await readFile(sciezkaMetryk, 'utf8'));
  } catch (error) {
    console.error(`Nie udalo sie wczytac ${sciezkaMetryk}: ${error.message}`);
    console.error('Najpierw uruchom `node src/metrics.mjs <katalog-wejsc>`.');
    process.exitCode = 1;
    return;
  }

  const plik = path.join(katalog, 'dashboard.html');
  await writeFile(plik, renderDashboard(metryki), 'utf8');
  console.log(`Zapisano ${plik}`);
  console.log('Otworz w przegladarce. Plik jest samodzielny, dziala bez internetu i bez serwera.');
}

main();
