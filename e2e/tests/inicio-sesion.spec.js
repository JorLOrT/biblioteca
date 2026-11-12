// Inicio de sesión: cada papel llega a su vista y una contraseña mala no entra.

import { expect, test } from "./fixtures.js";

test("el bibliotecario entra y ve sus tres pestañas", async ({ page, entrar, evidencia }) => {
  await entrar("jorge");

  await expect(page.getByRole("tab", { name: /Préstamos/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Catálogo/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Lectores/ })).toBeVisible();
  await evidencia("01-bibliotecario-pestanas");
});

test("el lector entra y ve su carnet y el catálogo", async ({ page, entrar, evidencia }) => {
  await entrar("pepito");

  await expect(page.locator("#my-card-body")).toContainText("Pepito");
  await expect(page.locator("#book-grid > li.book-card")).toHaveCount(6);
  await evidencia("02-lector-carnet-catalogo");
});

test("una contraseña incorrecta no deja entrar", async ({ page, entrar, evidencia }) => {
  await entrar("pepito", { contrasena: "no-es-esta" });

  await expect(page.locator("#login-error")).toHaveText("Usuario o contraseña incorrectos.");
  await expect(page).toHaveURL(/\/login$/);
  await evidencia("03-contrasena-incorrecta");
});
