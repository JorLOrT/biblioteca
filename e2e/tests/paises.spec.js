// Países e idiomas: las dos listas encadenadas y la tabla.
//
// Estas pruebas consultan de verdad countries.dev a través de la aplicación.
// La última usa la segunda aplicación, la que tiene el servicio caído.

import { URL_SIN_PAISES } from "../entorno.js";
import { expect, test } from "./fixtures.js";

/** Abre la vista de países con una cuenta (pepito, si no se dice otra). */
async function abrirPaises(page, entrar, usuario = "pepito", base = undefined) {
  await entrar(usuario, { base });
  await page.getByRole("link", { name: "Países e idiomas" }).click();
  await expect(page).toHaveURL(/\/countries$/);
}

test("la lista de países empieza desactivada", async ({ page, entrar, evidencia }) => {
  await abrirPaises(page, entrar);

  await expect(page.getByLabel("Región", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("País", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("País", { exact: true })).toHaveText("Primero elige una región");
  await evidencia("06-paises-vista-inicial");
});

test("al elegir una región se cargan sus países", async ({ page, entrar, evidencia }) => {
  await abrirPaises(page, entrar);
  await page.getByLabel("Región", { exact: true }).selectOption({ label: "África" });

  const pais = page.getByLabel("País", { exact: true });
  await expect(pais).toBeEnabled();
  await expect(pais.locator("option", { hasText: "Gambia" })).toHaveCount(1);
  await expect(page.locator("#countries-count")).toHaveText(/^\d+ países$/);
  await evidencia("07-paises-region-africa");
});

test("Bolivia muestra sus tres idiomas con su nombre nativo", async ({ page, entrar, evidencia }) => {
  await abrirPaises(page, entrar);
  await page.getByLabel("Región", { exact: true }).selectOption({ label: "América" });
  await page.getByLabel("País", { exact: true }).selectOption("BOL");

  const filas = page.locator(".languages-table tbody tr");
  await expect(filas).toHaveCount(3);
  await expect(filas.nth(0)).toContainText("Español");
  await expect(filas.nth(1)).toContainText("aymar aru");
  await expect(filas.nth(2)).toContainText("Runa Simi");
  await evidencia("08-paises-bolivia");
});

test("el bibliotecario consulta Gambia", async ({ page, entrar, evidencia }) => {
  await abrirPaises(page, entrar, "jorge");
  await page.getByLabel("Región", { exact: true }).selectOption({ label: "África" });
  await page.getByLabel("País", { exact: true }).selectOption("GMB");

  await expect(page.locator(".languages-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".languages-table")).toContainText("inglés");
  await evidencia("09-paises-gambia-bibliotecario");
});

test("cambiar de región borra la tabla anterior", async ({ page, entrar, evidencia }) => {
  await abrirPaises(page, entrar);
  await page.getByLabel("Región", { exact: true }).selectOption({ label: "América" });
  await page.getByLabel("País", { exact: true }).selectOption("PER");
  await expect(page.locator(".languages-table")).toContainText("Español");

  await page.getByLabel("Región", { exact: true }).selectOption({ label: "Europa" });
  await expect(page.locator(".languages-table")).toHaveCount(0);
  await expect(page.getByLabel("País", { exact: true })).toHaveValue("");
  await evidencia("10-paises-cambio-de-region");
});

test("en inglés los idiomas salen traducidos", async ({ page, entrar, evidencia }) => {
  await entrar("pepito");
  await page.goto("/countries?lang=en");
  await page.getByLabel("Region", { exact: true }).selectOption({ label: "Asia" });
  await page.getByLabel("Country", { exact: true }).selectOption("IND");

  await expect(page.locator(".languages-table")).toContainText("Hindi");
  await expect(page.locator(".languages-table")).toContainText("हिन्दी");
  await evidencia("11-paises-ingles-india");
});

test("si el servicio no responde se muestra un aviso", async ({ page, entrar, evidencia }) => {
  await abrirPaises(page, entrar, "pepito", URL_SIN_PAISES);
  await page.getByLabel("Región", { exact: true }).selectOption({ label: "Europa" });

  await expect(page.locator("#toast")).toHaveText(
    "El servicio de países no responde. Inténtalo de nuevo en un momento.",
  );
  await expect(page.getByLabel("País", { exact: true })).toBeDisabled();
  await evidencia("12-paises-servicio-caido");
});
