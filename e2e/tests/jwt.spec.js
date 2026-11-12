// Autenticación con JWT: el servicio de login y el token Bearer.
//
// Estas pruebas no abren el navegador: llaman a la API como lo haría otro
// programa, con el `request` de Playwright. No llevan cookies, así que la única
// forma de identificarse es el token.

import { createHmac } from "node:crypto";

import { SECRET_KEY } from "../entorno.js";
import { expect, test } from "./fixtures.js";

const b64url = (data) => Buffer.from(data).toString("base64url");
const leer = (parte) => JSON.parse(Buffer.from(parte, "base64url").toString());

/** Un JWT firmado con la misma clave que el servidor (ver business/token_service.py). */
function firmar(payload) {
  const clave = createHmac("sha256", SECRET_KEY).update("biblioteca-jwt").digest();
  const cuerpo = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}`;
  return `${cuerpo}.${createHmac("sha256", clave).update(cuerpo).digest("base64url")}`;
}

async function pedirToken(request, username, password) {
  const respuesta = await request.post("/api/auth/token", { data: { username, password } });
  expect(respuesta.status()).toBe(200);
  return (await respuesta.json()).access_token;
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

test("el servicio de login entrega un token Bearer", async ({ request }) => {
  const respuesta = await request.post("/api/auth/token", {
    data: { username: "jorge", password: "jorge123" },
  });

  expect(respuesta.status()).toBe(200);
  expect(respuesta.headers()["cache-control"]).toBe("no-store");
  const cuerpo = await respuesta.json();
  expect(cuerpo.token_type).toBe("Bearer");
  expect(cuerpo.expires_in).toBe(3600);

  const partes = cuerpo.access_token.split(".");
  expect(partes).toHaveLength(3);
  expect(leer(partes[0])).toMatchObject({ alg: "HS256", typ: "JWT" });
  expect(leer(partes[1])).toMatchObject({ iss: "biblioteca-n-capas", sub: "jorge", role: "librarian" });
});

test("con el token, el bibliotecario consulta los préstamos", async ({ request }) => {
  const token = await pedirToken(request, "jorge", "jorge123");

  const me = await request.get("/api/auth/me", { headers: bearer(token) });
  expect(await me.json()).toMatchObject({ username: "jorge", auth: "bearer" });

  const prestamos = await request.get("/api/loans", { headers: bearer(token) });
  expect(prestamos.status()).toBe(200);
  expect(Array.isArray(await prestamos.json())).toBe(true);
});

test("sin token los servicios responden 401", async ({ request }) => {
  const respuesta = await request.get("/api/loans");

  expect(respuesta.status()).toBe(401);
  expect(respuesta.headers()["www-authenticate"]).toBe('Bearer realm="biblioteca"');
  expect((await respuesta.json()).code).toBe("error.login_required");
});

test("una contraseña incorrecta no recibe token", async ({ request }) => {
  const respuesta = await request.post("/api/auth/token", {
    data: { username: "jorge", password: "no-es-esta" },
  });

  expect(respuesta.status()).toBe(401);
  expect(await respuesta.json()).not.toHaveProperty("access_token");
});

test("el token de un lector no abre los servicios del bibliotecario", async ({ request }) => {
  const token = await pedirToken(request, "pepito", "pepito123");

  const prestamos = await request.get("/api/loans", { headers: bearer(token) });
  expect(prestamos.status()).toBe(403);

  // Su propia cuenta sí: el servidor sabe quién es por el token.
  const suCuenta = await request.get("/api/readers/me", { headers: bearer(token) });
  expect(suCuenta.status()).toBe(200);
  expect(await suCuenta.json()).toMatchObject({ username: "pepito" });
});

test("un token alterado se rechaza", async ({ request }) => {
  const [cabecera, cuerpo, firma] = (await pedirToken(request, "pepito", "pepito123")).split(".");
  // El lector se cambia el papel, pero no puede volver a firmar el token.
  const alterado = `${cabecera}.${b64url(JSON.stringify({ ...leer(cuerpo), role: "librarian" }))}.${firma}`;

  const respuesta = await request.get("/api/loans", { headers: bearer(alterado) });
  expect(respuesta.status()).toBe(401);
  expect(respuesta.headers()["www-authenticate"]).toContain('error="invalid_token"');
  expect((await respuesta.json()).code).toBe("error.token_invalid");
});

test("un token vencido se rechaza", async ({ request }) => {
  const ahora = Math.floor(Date.now() / 1000);
  const vencido = firmar({
    iss: "biblioteca-n-capas", sub: "jorge", name: "Jorge", role: "librarian",
    iat: ahora - 7200, exp: ahora - 3600,
  });

  const respuesta = await request.get("/api/loans", { headers: bearer(vencido) });
  expect(respuesta.status()).toBe(401);
  expect((await respuesta.json()).code).toBe("error.token_expired");
});

test("un token sin firma, con alg none, se rechaza", async ({ request }) => {
  const sinFirma = `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64url(JSON.stringify({
    iss: "biblioteca-n-capas", sub: "jorge", name: "Jorge", role: "librarian",
    iat: 1, exp: 9999999999,
  }))}.`;

  const respuesta = await request.get("/api/loans", { headers: bearer(sinFirma) });
  expect(respuesta.status()).toBe(401);
  expect((await respuesta.json()).code).toBe("error.token_invalid");
});

// --- En el navegador ---------------------------------------------------------

const JWT = /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/;

test("el navegador envía el token Bearer en las llamadas a la API", async ({ page, entrar, evidencia }) => {
  const libros = page.waitForRequest((r) => new URL(r.url()).pathname === "/api/books");
  await entrar("pepito");

  const peticion = await libros;
  expect(await peticion.headerValue("authorization")).toMatch(JWT);
  expect((await peticion.response()).status()).toBe(200);
  await expect(page.locator("#book-grid > li.book-card")).toHaveCount(6);
  await evidencia("13-navegador-con-bearer");
});

test("si el token del navegador ya no sirve, se renueva con la sesión", async ({ page, entrar }) => {
  await entrar("pepito");
  await expect(page.locator("#book-grid > li.book-card")).toHaveCount(6);

  // Un token que el servidor no aceptará, como si hubiera vencido o lo hubieran cambiado.
  await page.evaluate(() => sessionStorage.setItem("biblioteca.token",
    JSON.stringify({ value: "no.es.valido", expires: Date.now() + 3_600_000 })));
  const renovacion = page.waitForResponse((r) => r.url().endsWith("/api/auth/session/token"));
  await page.reload();

  expect((await renovacion).status()).toBe(200);
  await expect(page.locator("#book-grid > li.book-card")).toHaveCount(6);
  const guardado = await page.evaluate(() => JSON.parse(sessionStorage.getItem("biblioteca.token")).value);
  expect(guardado).not.toBe("no.es.valido");
});
