// Lo que comparten todas las páginas: traducciones, llamadas a la API, avisos,
// fechas, validación con regex, portadas y diálogos. Solo habla HTTP con la
// capa de presentación: no conoce las reglas de negocio ni la base de datos.

let messages = {};  // catálogo de traducciones que entrega /api/i18n
let rules = {};     // expresiones regulares que entrega /api/validation-rules

// --- Traducción -------------------------------------------------------------

/** Traduce una clave sustituyendo sus parámetros: t("wishlist.count", {count: 2, max: 5}) */
export function t(key, params = {}) {
  let text = messages[key] ?? key;
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(value);
  }
  return text;
}

/** Como t(), pero con singular y cero: usa «<clave>_one» si n es 1 y
 *  «<clave>_zero» si n es 0, cuando el catálogo las tiene. */
export function tn(key, n, params = {}) {
  const variant = n === 0 ? "_zero" : n === 1 ? "_one" : "";
  const chosen = variant && messages[key + variant] !== undefined ? key + variant : key;
  return t(chosen, params);
}

// --- Llamadas a la API ------------------------------------------------------

/** Llama a la API y convierte el {error} del servidor en una excepción.
 *  Si la sesión terminó, vuelve al inicio de sesión. Si la respuesta ni
 *  siquiera es JSON (un 500 en HTML, por ejemplo) se usa el mensaje genérico. */
export async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (data.code === "error.login_required") {
    location.href = "/login";
  }
  if (!response.ok) {
    throw new Error(data.error || t("error.unexpected"));
  }
  return data;
}

export function sendJson(method, url, body) {
  return api(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Avisos -----------------------------------------------------------------

const toast = document.getElementById("toast");
let toastTimer = null;

/** Un aviso flotante. Los de éxito se van solos; los errores se quedan hasta
 *  pulsarlos, para que dé tiempo a leerlos. */
export function notify(text, kind = "ok") {
  toast.textContent = text;
  toast.className = "toast " + kind;
  toast.hidden = false;
  clearTimeout(toastTimer);
  if (kind === "ok") toastTimer = setTimeout(clearNotice, 5000);
}

export function clearNotice() {
  clearTimeout(toastTimer);
  toast.hidden = true;
}

toast.addEventListener("click", clearNotice);

/** Ejecuta una acción del usuario y, si algo falla, muestra el error. */
export async function runAction(action) {
  try {
    await action();
  } catch (error) {
    notify(error.message, "error");
  }
}

/** Como runAction, para lo que se hace dentro de un diálogo: el error se
 *  muestra en el propio diálogo, porque un <dialog> modal tapa el aviso. */
export async function runInDialog(dialog, action) {
  const box = dialog.querySelector(".dialog-error");
  box.hidden = true;
  try {
    await action();
  } catch (error) {
    box.textContent = error.message;
    box.hidden = false;
  }
}

// --- Texto y dinero ---------------------------------------------------------

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapa un texto para insertarlo en HTML, también dentro de un atributo. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

export const money = (amount) => t("currency", { amount: Number(amount).toFixed(2) });

// --- Fechas -------------------------------------------------------------------
// El servidor habla en AAAA-MM-DD; al usuario se le muestran en el formato de
// su idioma, el mismo que usan los campos de fecha del navegador.

const pad = (n) => String(n).padStart(2, "0");

/** Hoy en AAAA-MM-DD, en la hora local. (toISOString usaría UTC, y en Perú a
 *  partir de las 19:00 ya sería mañana.) */
export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(document.documentElement.lang, {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date(year, month - 1, day));
}

/** Días que faltan desde hoy hasta una fecha AAAA-MM-DD (negativo si ya pasó). */
export function daysUntil(iso) {
  const toUtc = (text) => {
    const [year, month, day] = text.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(iso) - toUtc(todayIso())) / 86400000);
}

// --- Validación con expresiones regulares -----------------------------------
// Los patrones NO se escriben aquí: se piden a /api/validation-rules, que los
// toma de business/validators.py. Así el navegador y el servidor aplican
// exactamente la misma regla y no pueden quedar desincronizados.

/** ¿Encaja el valor de este campo con su expresión regular? */
export function fieldIsValid(input) {
  const pattern = rules[input.dataset.rule];
  if (!pattern) return true;
  return new RegExp(pattern).test(input.value.trim());
}

/** Pinta el campo y muestra u oculta su mensaje de error.
 *  Mientras se rellena, un campo vacío no muestra mensaje (molestaría); al
 *  enviar el formulario sí (`includeEmpty`). */
export function markField(input, includeEmpty = false) {
  const valid = fieldIsValid(input);
  const filled = input.value.trim() !== "";
  const field = input.closest(".field");
  const error = field.querySelector(".field-error");
  const showError = !valid && (filled || includeEmpty);

  input.classList.toggle("invalid", showError);
  input.classList.toggle("valid", valid && filled);
  field.classList.toggle("has-error", showError);
  if (showError) error.textContent = t("error.invalid_" + input.dataset.rule);
  error.hidden = !showError;
  return valid;
}

/** Valida el formulario entero. Devuelve true solo si todos los campos pasan. */
export function formIsValid(form) {
  const inputs = [...form.querySelectorAll("[data-rule]")];
  // Se evalúan todos para que se vea de una vez qué está mal.
  const results = inputs.map((input) => markField(input, true));
  const firstInvalid = inputs.find((input, i) => !results[i]);
  if (firstInvalid) firstInvalid.focus();
  return results.every(Boolean);
}

/** Validación en vivo: al salir del campo se marca; al escribir solo se quita
 *  el error, no se añade, que molesta menos. */
export function enableLiveValidation(form) {
  form.querySelectorAll("[data-rule]").forEach((input) => {
    input.addEventListener("blur", () => markField(input));
    input.addEventListener("input", () => {
      if (input.classList.contains("invalid") && fieldIsValid(input)) markField(input);
    });
  });
}

export function resetForm(form) {
  form.reset();
  form.querySelectorAll("[data-rule]").forEach((input) => {
    input.classList.remove("invalid", "valid");
    const field = input.closest(".field");
    field.classList.remove("has-error");
    field.querySelector(".field-error").hidden = true;
  });
}

// --- Portadas de Open Library -----------------------------------------------
// La portada se pide por ISBN directamente a covers.openlibrary.org. Si no la
// tiene, responde con una imagen de 1×1 píxel; si no hay red, la imagen falla.
// En los dos casos se muestra una portada genérica con la inicial del título.

function hueFor(text) {
  let hash = 0;
  for (const char of String(text)) hash = (hash * 31 + char.codePointAt(0)) % 360;
  return hash;
}

function placeholderCover(title, size) {
  const initial = escapeHtml(String(title || "?").trim().charAt(0).toUpperCase());
  return `<span class="cover cover-${size} placeholder" style="--hue:${hueFor(title)}"
                aria-hidden="true">${initial}</span>`;
}

/** La portada de un libro, o una genérica si no tiene ISBN. */
export function coverHtml(book, size = "md") {
  const isbn = book.isbn || book.book_isbn;
  const title = book.title || book.book_title;
  if (!isbn) return placeholderCover(title, size);
  const letter = size === "lg" ? "L" : "M";
  return `<img class="cover cover-${size}" loading="lazy" alt="" style="--hue:${hueFor(title)}"
               data-title="${escapeHtml(title)}"
               src="https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-${letter}.jpg">`;
}

function replaceWithPlaceholder(img) {
  const size = [...img.classList].find((c) => c.startsWith("cover-"))?.slice(6) || "md";
  img.outerHTML = placeholderCover(img.dataset.title, size);
}

// Los eventos `load` y `error` de una imagen no suben por el documento, pero
// sí se pueden escuchar en la fase de captura.
const isCover = (target) => target instanceof HTMLImageElement && target.classList.contains("cover");
document.addEventListener("load", (event) => {
  if (isCover(event.target) && event.target.naturalWidth <= 1) replaceWithPlaceholder(event.target);
}, true);
document.addEventListener("error", (event) => {
  if (isCover(event.target)) replaceWithPlaceholder(event.target);
}, true);

// --- Diálogos -----------------------------------------------------------------

// Los botones con `data-close` cierran el diálogo en el que están.
document.addEventListener("click", (event) => {
  const closer = event.target.closest("[data-close]");
  if (closer) closer.closest("dialog").close("cancel");
});

// Pulsar fuera de la ventana (en el fondo oscuro) también la cierra.
document.addEventListener("mousedown", (event) => {
  if (event.target instanceof HTMLDialogElement) event.target.close("cancel");
});

const confirmDialog = document.getElementById("confirm-dialog");

/** Pregunta antes de algo que no se puede deshacer. Devuelve true o false.
 *  `body` es HTML ya escapado por quien lo llama. */
export function confirmAction({ title, body, ok, danger = false }) {
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-body").innerHTML = body;
  const okButton = document.getElementById("confirm-ok");
  okButton.textContent = ok;
  okButton.className = "btn " + (danger ? "danger" : "primary");
  confirmDialog.returnValue = "";
  confirmDialog.showModal();
  okButton.focus();
  return new Promise((resolve) => {
    confirmDialog.addEventListener("close", () => resolve(confirmDialog.returnValue === "ok"),
                                   { once: true });
  });
}

// --- Cabecera: idioma y salir -----------------------------------------------

function setupHeader() {
  // Cambiar de idioma: el servidor lo guarda en la sesión y se recarga la
  // página para que también los textos fijos (los que pinta Jinja) cambien.
  document.getElementById("language-select").addEventListener("change", async (event) => {
    await api(`/api/i18n/${event.target.value}`, { method: "POST" });
    location.reload();
  });

  document.getElementById("logout")?.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    location.href = "/login";
  });
}

/** La cuenta con la que se inició sesión, tal como la pinta la plantilla. */
export function currentUser() {
  const { username, name, role } = document.body.dataset;
  return username ? { username, name, role } : null;
}

/** Lo primero que hace cada página: traducciones, reglas y cabecera. */
export async function start() {
  const [i18n, validation] = await Promise.all([
    api("/api/i18n"),
    api("/api/validation-rules"),
  ]);
  messages = i18n.messages;
  rules = validation.patterns;
  setupHeader();
}
