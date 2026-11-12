// Lo que comparten todas las pruebas: iniciar sesión y tomar capturas.
//
// `test` es el de Playwright con dos utilidades más:
//   - entrar(usuario, { base }): inicia sesión por el formulario, como una persona.
//   - evidencia(nombre): guarda una captura en evidencia/ y la adjunta al
//     reporte HTML. Antes pone en la esquina una etiqueta con el worker que
//     ejecuta la prueba y la hora, para que se vea que corren a la vez.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { test as base, expect } from "@playwright/test";

import { URL_APP } from "../entorno.js";

const CARPETA_EVIDENCIA = join(dirname(fileURLToPath(import.meta.url)), "..", "evidencia", "pruebas");

// Las cuentas de prueba que crea la aplicación al arrancar.
const CUENTAS = {
  jorge: "jorge123",
  pepito: "pepito123",
  juanita: "juanita123",
};

export const test = base.extend({
  entrar: async ({ page }, use) => {
    await use(async (usuario, { base = URL_APP, contrasena = CUENTAS[usuario] } = {}) => {
      await page.goto(`${base}/login`);
      await page.locator("#login-username").fill(usuario);
      await page.locator("#login-password").fill(contrasena);
      await page.getByRole("button", { name: "Entrar" }).click();
      // Con la contraseña buena, espera a salir de /login antes de seguir.
      if (contrasena === CUENTAS[usuario]) {
        await page.waitForURL((url) => !url.pathname.endsWith("/login"));
      }
    });
  },

  evidencia: async ({ page }, use, testInfo) => {
    mkdirSync(CARPETA_EVIDENCIA, { recursive: true });
    await use(async (nombre) => {
      const worker = testInfo.parallelIndex + 1;
      const hora = new Date().toLocaleTimeString("es-PE", { hour12: false }) +
        "." + String(new Date().getMilliseconds()).padStart(3, "0");
      await page.evaluate(({ worker, hora }) => {
        document.getElementById("etiqueta-e2e")?.remove();
        const etiqueta = document.createElement("div");
        etiqueta.id = "etiqueta-e2e";
        etiqueta.textContent = `Playwright · worker ${worker} · ${hora}`;
        etiqueta.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:9999;" +
          "padding:6px 12px;border-radius:6px;background:#1f2933;color:#fff;" +
          "font:600 13px/1.4 ui-monospace,Menlo,monospace;box-shadow:0 2px 8px rgba(0,0,0,.25)";
        document.body.append(etiqueta);
      }, { worker, hora });

      const ruta = join(CARPETA_EVIDENCIA, `${nombre}.png`);
      await page.screenshot({ path: ruta });
      await testInfo.attach(nombre, { path: ruta, contentType: "image/png" });
    });
  },
});

export { expect };
