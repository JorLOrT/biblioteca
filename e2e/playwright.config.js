// Configuración de Playwright: pruebas de punta a punta, en paralelo.
//
// Cómo se reparte el trabajo:
//   - `workers: 4` lanza cuatro procesos de Node. Cada uno abre su propio
//     navegador y ejecuta las pruebas que le van tocando.
//   - `fullyParallel: true` reparte prueba a prueba, no archivo a archivo: dos
//     pruebas del mismo archivo pueden ir a la vez en workers distintos.
//   - Cada prueba recibe un contexto de navegador nuevo, con sus propias
//     cookies. Por eso dos pruebas pueden iniciar sesión con la misma cuenta a la
//     vez sin pisarse.
//
// Playwright arranca la aplicación antes de las pruebas y la apaga al final
// (`webServer`). Arranca dos: una normal y otra con el servicio de países
// apuntando a una dirección donde no hay nada, para probar ese error.

import { defineConfig, devices } from "@playwright/test";

import { PORT, PORT_SIN_PAISES, SECRET_KEY, URL_APP } from "./entorno.js";

// El Python del entorno virtual de la aplicación. Se puede cambiar con PYTHON.
const PYTHON = process.env.PYTHON ?? ".venv/bin/python";

/** Una instancia de la aplicación con su propia base de datos, recién creada. */
function servidor(port, entornoExtra = {}) {
  const db = `e2e/.tmp/biblioteca-${port}.db`;
  return {
    command: `mkdir -p e2e/.tmp && rm -f ${db} && ${PYTHON} app.py`,
    cwd: "..",
    url: `http://127.0.0.1:${port}/login`,
    // Si el puerto ya está ocupado, la ejecución se detiene: nunca se prueba
    // contra un servidor que no arrancó Playwright.
    reuseExistingServer: false,
    timeout: 30_000,
    // El registro de cada petición taparía la salida de las pruebas. Para
    // depurar un arranque fallido, cámbialo a "pipe".
    stderr: "ignore",
    env: {
      SECRET_KEY,
      PORT: String(port),
      LIBRARY_DB: db,
      ...entornoExtra,
    },
  };
}

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 4,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["./reporters/linea-de-tiempo.js"],
  ],
  use: {
    baseURL: URL_APP,
    locale: "es-PE",
    // Las capturas las toma cada prueba cuando quiere (fixtures.js); sin videos.
    screenshot: "only-on-failure",
    video: "off",
    trace: "off",
  },
  projects: [
    {
      name: "chrome",
      // Usa el Google Chrome instalado: no hace falta descargar navegadores.
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1280, height: 860 } },
    },
  ],
  webServer: [
    servidor(PORT),
    servidor(PORT_SIN_PAISES, { COUNTRIES_API_URL: "http://127.0.0.1:9" }),
  ],
});
