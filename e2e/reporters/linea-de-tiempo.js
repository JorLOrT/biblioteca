// Reporter propio: la línea de tiempo de la ejecución.
//
// Playwright avisa a los reporters cuando empieza y termina cada prueba, con el
// worker que la ejecutó (`parallelIndex`), su hora de inicio y su duración. Con
// eso este reporter:
//   - imprime en la terminal qué worker ejecutó cada prueba y cuándo, y
//   - escribe evidencia/linea-de-tiempo-<n>-workers.html, con una barra por
//     prueba y una fila por worker: las barras que se solapan corrieron a la vez.

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), "..", "evidencia");

const segundos = (ms) => (ms / 1000).toFixed(2) + " s";
const escapar = (texto) => String(texto).replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export default class LineaDeTiempo {
  onBegin(config) {
    this.workers = config.workers;
    this.pruebas = [];
  }

  onTestEnd(test, result) {
    this.pruebas.push({
      titulo: test.title,
      archivo: basename(test.location.file),
      worker: result.parallelIndex + 1,
      inicio: result.startTime.getTime(),
      duracion: result.duration,
      estado: result.status,
    });
  }

  onEnd() {
    if (this.pruebas.length === 0) return;
    // El reloj empieza con la primera prueba: no cuenta el arranque de la app.
    const cero = Math.min(...this.pruebas.map((p) => p.inicio));
    const pruebas = this.pruebas
      .map((p) => ({ ...p, inicio: p.inicio - cero }))
      .sort((a, b) => a.inicio - b.inicio);
    const total = Math.max(...pruebas.map((p) => p.inicio + p.duracion));
    const suma = pruebas.reduce((acc, p) => acc + p.duracion, 0);

    console.log(`\nLínea de tiempo con ${this.workers} worker(s):`);
    console.log("  Worker  Inicio    Fin       Prueba");
    for (const p of pruebas) {
      console.log(`  ${String(p.worker).padEnd(6)}  ${segundos(p.inicio).padEnd(8)}  ` +
        `${segundos(p.inicio + p.duracion).padEnd(8)}  ${p.archivo} › ${p.titulo}`);
    }
    console.log(`\n  Suma de lo que duró cada prueba: ${segundos(suma)}`);
    console.log(`  Tiempo real, de la primera prueba a la última: ${segundos(total)}\n`);

    mkdirSync(CARPETA, { recursive: true });
    const ruta = join(CARPETA, `linea-de-tiempo-${this.workers}-workers.html`);
    writeFileSync(ruta, this.html(pruebas, total, suma));
  }

  html(pruebas, total, suma) {
    const filas = [];
    for (let w = 1; w <= this.workers; w++) {
      const barras = pruebas.filter((p) => p.worker === w).map((p) => {
        const izquierda = (p.inicio / total) * 100;
        const ancho = Math.max((p.duracion / total) * 100, 0.4);
        return `<div class="barra ${p.estado}" style="left:${izquierda}%;width:${ancho}%"
                     title="${escapar(p.titulo)}"><span>${escapar(p.titulo)}</span></div>`;
      }).join("");
      filas.push(`<div class="fila"><div class="nombre">Worker ${w}</div>
                  <div class="pista">${barras}</div></div>`);
    }
    const tabla = pruebas.map((p) => `<tr><td>${p.worker}</td><td>${segundos(p.inicio)}</td>
      <td>${segundos(p.inicio + p.duracion)}</td><td>${escapar(p.archivo)}</td>
      <td>${escapar(p.titulo)}</td><td class="${p.estado}">${p.estado}</td></tr>`).join("");

    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Línea de tiempo · ${this.workers} worker(s)</title>
<style>
  body { margin: 32px; font: 14px/1.5 -apple-system, "Segoe UI", sans-serif; color: #1b2230; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .resumen { color: #667085; margin: 0 0 20px; }
  .resumen strong { color: #1b2230; }
  .fila { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .nombre { width: 80px; font-weight: 600; }
  .pista { position: relative; flex: 1; height: 34px; background: #f4f5f7; border-radius: 6px; }
  .barra { position: absolute; top: 3px; bottom: 3px; border-radius: 5px; overflow: hidden;
           background: #0f6e5c; color: #fff; font-size: 11px; padding: 0 6px;
           display: flex; align-items: center; border-right: 2px solid #fff; box-sizing: border-box; }
  .barra.failed, .barra.timedOut { background: #c0352b; }
  .barra span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .eje { display: flex; justify-content: space-between; margin-left: 92px; color: #667085; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; margin-top: 24px; font-size: 13px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e3e6eb; }
  th { color: #667085; font-size: 12px; text-transform: uppercase; }
  td.passed { color: #157347; font-weight: 600; } td.failed { color: #c0352b; font-weight: 600; }
</style></head><body>
<h1>Línea de tiempo de las pruebas · ${this.workers} worker(s)</h1>
<p class="resumen">${pruebas.length} pruebas · suma de sus duraciones <strong>${segundos(suma)}</strong>
  · tiempo real <strong>${segundos(total)}</strong></p>
${filas.join("")}
<div class="eje"><span>0 s</span><span>${segundos(total / 2)}</span><span>${segundos(total)}</span></div>
<table><thead><tr><th>Worker</th><th>Inicio</th><th>Fin</th><th>Archivo</th><th>Prueba</th><th>Estado</th></tr></thead>
<tbody>${tabla}</tbody></table>
</body></html>`;
  }
}
