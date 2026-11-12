// Catálogo del lector: la búsqueda no distingue mayúsculas ni tildes.

import { expect, test } from "./fixtures.js";

test("el lector busca un autor escrito sin tildes", async ({ page, entrar, evidencia }) => {
  await entrar("pepito");
  // Primero que cargue el catálogo completo; si no, esa carga pisaría la búsqueda.
  await expect(page.locator("#book-grid > li.book-card")).toHaveCount(6);
  await page.locator("#book-search").fill("garcia marquez");

  await expect(page.locator("#book-grid > li.book-card")).toHaveCount(1);
  await expect(page.locator("#book-grid")).toContainText("Cien años de soledad");
  await evidencia("04-busqueda-sin-tildes");
});

test("una búsqueda sin resultados deja el catálogo vacío", async ({ page, entrar, evidencia }) => {
  await entrar("pepito");
  // Primero que cargue el catálogo completo; si no, esa carga pisaría la búsqueda.
  await expect(page.locator("#book-grid > li.book-card")).toHaveCount(6);
  await page.locator("#book-search").fill("zzzz");

  await expect(page.locator("#book-grid > li.empty")).toContainText("zzzz");
  await expect(page.locator("#book-grid > li.book-card")).toHaveCount(0);
  await evidencia("05-busqueda-sin-resultados");
});
