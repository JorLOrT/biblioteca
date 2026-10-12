// Cliente de la API REST. Solo habla HTTP con la capa de presentación:
// no conoce ni las reglas de negocio ni la base de datos.

const notice = document.getElementById("notice");
const bookCard = document.getElementById("book-card");
const bookForm = document.getElementById("book-form");
const onlyAvailable = document.getElementById("only-available");
const bookRows = document.getElementById("book-rows");
const loanRows = document.getElementById("loan-rows");
const historyRows = document.getElementById("history-rows");
const activityPanel = document.getElementById("activity");
const wishlistPanel = document.getElementById("wishlist");
const calcForm = document.getElementById("calc-form");
const calcResult = document.getElementById("calc-result");
const lookupResult = document.getElementById("lookup-result");

let books = [];     // último catálogo recibido, para buscar un libro por su id
let loans = [];     // último listado de préstamos, activos e historial
let wishlist = [];  // copia local de la lista de deseos que guarda la sesión
let messages = {};  // catálogo de traducciones que entrega /api/i18n
let rules = {};     // expresiones regulares que entrega /api/validation-rules
let editingId = null;  // libro que se está editando; null mientras se agrega uno
let noticeTimer = null;

/** Traduce una clave sustituyendo sus parámetros: t("wishlist.count", {count: 2, max: 5}) */
function t(key, params = {}) {
  let text = messages[key] ?? key;
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(value);
  }
  return text;
}

/** Como t(), pero con singular: usa «<clave>_one» cuando `days` es 1. */
function tDays(key, days, params = {}) {
  const singular = days === 1 && messages[key + "_one"] !== undefined;
  return t(singular ? key + "_one" : key, { ...params, days });
}

function showNotice(text, kind) {
  notice.textContent = text;
  notice.className = "notice " + kind;
  notice.hidden = false;
  clearTimeout(noticeTimer);
  // Los avisos de éxito se van solos; los errores se quedan hasta pulsarlos.
  if (kind === "ok") noticeTimer = setTimeout(clearNotice, 6000);
}

function clearNotice() {
  clearTimeout(noticeTimer);
  notice.hidden = true;
}

notice.addEventListener("click", clearNotice);

/** Llama a la API y convierte el {error} del servidor en una excepción.
 *  Si la respuesta ni siquiera es JSON (un 500 en HTML, por ejemplo) se usa el
 *  mensaje genérico, en lugar del error interno de leer el JSON. */
async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || t("error.unexpected"));
  }
  return data;
}

function sendJson(method, url, body) {
  return api(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Ejecuta una acción del usuario: borra el aviso anterior y, si algo falla,
 *  muestra el error. Es el try/catch que antes repetía cada botón. */
async function runAction(action) {
  clearNotice();
  try {
    await action();
  } catch (error) {
    showNotice(error.message, "error");
  }
}

/** Avisa de que la acción salió bien y vuelve a pintar los datos. */
async function succeed(text) {
  showNotice(text, "ok");
  await reload();
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapa un texto para insertarlo en HTML. Incluye las comillas, para que
 *  también sea seguro dentro de un atributo (`alt="..."`). */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

const money = (amount) => t("currency", { amount: Number(amount).toFixed(2) });

// --- Fechas ----------------------------------------------------------------
// El servidor habla en AAAA-MM-DD; al usuario se le muestran en el formato de
// su idioma, el mismo que usan los campos de fecha del navegador.

const pad = (n) => String(n).padStart(2, "0");

/** Hoy en AAAA-MM-DD, en la hora local. (toISOString usaría UTC, y en Perú a
 *  partir de las 19:00 ya sería mañana.) */
function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(document.documentElement.lang, {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date(year, month - 1, day));
}

/** Días que faltan desde hoy hasta una fecha AAAA-MM-DD (negativo si ya pasó). */
function daysUntil(iso) {
  const toUtc = (text) => {
    const [year, month, day] = text.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(iso) - toUtc(todayIso())) / 86400000);
}

// ===========================================================================
//  VALIDACIÓN DEL FORMULARIO CON EXPRESIONES REGULARES
//  Los patrones NO se escriben aquí: se piden a /api/validation-rules, que los
//  toma de business/validators.py. Así el navegador y el servidor aplican
//  exactamente la misma regla y no pueden quedar desincronizados.
// ===========================================================================

/** ¿Encaja el valor de este campo con su expresión regular? */
function fieldIsValid(input) {
  const pattern = rules[input.dataset.rule];
  if (!pattern) return true;
  return new RegExp(pattern).test(input.value.trim());
}

/** Pinta el campo y muestra u oculta su mensaje de error.
 *  Mientras se rellena, un campo vacío no muestra mensaje (molestaría); al
 *  enviar el formulario sí (`includeEmpty`). */
function markField(input, includeEmpty = false) {
  const valid = fieldIsValid(input);
  const filled = input.value.trim() !== "";
  const error = input.closest(".field").querySelector(".field-error");
  const showError = !valid && (filled || includeEmpty);

  input.classList.toggle("invalid", !valid);
  input.classList.toggle("valid", valid && filled);
  if (showError) error.textContent = t("error.invalid_" + input.dataset.rule);
  error.hidden = !showError;
  return valid;
}

/** Valida el formulario entero. Devuelve true solo si todos los campos pasan. */
function formIsValid(form) {
  const inputs = [...form.querySelectorAll("[data-rule]")];
  // Se evalúan todos para que el usuario vea de una vez qué está mal.
  const results = inputs.map((input) => markField(input, true));
  const firstInvalid = inputs.find((input, i) => !results[i]);
  if (firstInvalid) firstInvalid.focus();
  return results.every(Boolean);
}

/** Conecta la validación en vivo: al escribir y al salir del campo. */
function enableLiveValidation(form) {
  form.querySelectorAll("[data-rule]").forEach((input) => {
    input.addEventListener("blur", () => markField(input));
    input.addEventListener("input", () => {
      // Mientras se escribe solo se quita el error, no se añade: molesta menos.
      if (input.classList.contains("invalid") && fieldIsValid(input)) {
        markField(input);
      }
    });
  });
}

function resetForm(form) {
  form.reset();
  form.querySelectorAll("[data-rule]").forEach((input) => {
    input.classList.remove("invalid", "valid");
    input.closest(".field").querySelector(".field-error").hidden = true;
  });
}

// --- Catálogo --------------------------------------------------------------

const bookById = (id) => books.find((book) => book.id === id);
const activeLoanFor = (bookId) => loans.find((loan) => loan.is_active && loan.book_id === bookId);

/** Título, y debajo autor, año e ISBN: lo que identifica a un libro. */
function bookCell(title, isbn, meta = "") {
  return `
    <span class="book-title">${escapeHtml(title)}</span>
    ${meta ? `<span class="book-meta">${meta}</span>` : ""}
    <span class="book-meta isbn">ISBN ${isbn ? escapeHtml(isbn) : "—"}</span>`;
}

/** Disponible, o prestado con a quién y hasta cuándo. */
function bookStatus(book, loan) {
  if (book.available) {
    return `<span class="badge available">${t("status.available")}</span>`;
  }
  const detail = loan
    ? `<span class="detail ${loan.days_late > 0 ? "late" : ""}">${
        t(loan.days_late > 0 ? "catalog.lent_overdue" : "catalog.lent_detail", {
          borrower: escapeHtml(loan.borrower),
          date: formatDate(loan.due_date),
        })}</span>`
    : "";
  return `<span class="badge borrowed">${t("status.borrowed")}</span>${detail}`;
}

function bookRow(book) {
  const wished = wishlist.includes(book.id);
  const loan = activeLoanFor(book.id);
  const meta = escapeHtml(book.author) + (book.year ? ` · ${book.year}` : "");

  // Un libro disponible se presta; uno prestado se devuelve desde aquí mismo.
  const mainAction = loan
    ? `<button class="secondary" data-action="return" data-id="${loan.id}">${t("action.return")}</button>`
    : book.available
      ? `<button data-action="lend" data-id="${book.id}">${t("action.lend")}</button>`
      : "";

  // Un libro prestado no se puede eliminar: el botón lo dice antes de intentarlo.
  const blocked = book.available
    ? ""
    : `disabled title="${escapeHtml(t("action.delete_blocked"))}"`;

  return `
    <tr>
      <td>${bookCell(book.title, book.isbn, meta)}</td>
      <td>${bookStatus(book, loan)}</td>
      <td class="actions">
        <button class="star ${wished ? "active" : ""}" data-action="wish" data-id="${book.id}"
                title="${escapeHtml(t(wished ? "action.wishlist_remove" : "action.wishlist_add"))}">
          ${wished ? "★" : "☆"}
        </button>
        ${mainAction}
        <button class="plain" data-action="edit" data-id="${book.id}">${t("action.edit")}</button>
        <button class="danger" data-action="delete" data-id="${book.id}" ${blocked}>${t("action.delete")}</button>
      </td>
    </tr>
  `;
}

function renderBooks(list) {
  books = list;
  const empty = onlyAvailable.checked ? "empty.available" : "empty.books";
  bookRows.innerHTML = list.length
    ? list.map(bookRow).join("")
    : `<tr><td colspan="3" class="empty">${t(empty)}</td></tr>`;
}

// --- Préstamos: activos e historial ----------------------------------------

/** El nombre y, debajo, cómo localizar a quien tiene el libro. */
function borrowerCell(loan) {
  const contact = [loan.borrower_phone, loan.borrower_email].filter(Boolean);
  return escapeHtml(loan.borrower)
    + (contact.length ? `<span class="book-meta">${contact.map(escapeHtml).join(" · ")}</span>` : "");
}

/** Cuánto le queda a un préstamo activo, o cuánto lleva de retraso. */
function dueStatus(loan) {
  if (loan.days_late > 0) {
    return `<span class="detail late">${
      tDays("loan.overdue", loan.days_late, { fine: money(loan.fine) })}</span>`;
  }
  const left = Math.max(0, daysUntil(loan.due_date));
  return `<span class="detail">${left === 0 ? t("loan.due_today") : tDays("loan.due_in", left)}</span>`;
}

function activeLoanRow(loan) {
  return `
    <tr class="${loan.days_late > 0 ? "overdue" : ""}">
      <td>${bookCell(loan.book_title, loan.book_isbn)}</td>
      <td data-label="${t("table.borrower")}">${borrowerCell(loan)}</td>
      <td data-label="${t("table.loan_date")}">${formatDate(loan.loan_date)}</td>
      <td data-label="${t("table.due_date")}">${formatDate(loan.due_date)}${dueStatus(loan)}</td>
      <td class="actions">
        <button class="secondary" data-action="return" data-id="${loan.id}">${t("action.return")}</button>
      </td>
    </tr>
  `;
}

function returnedLoanRow(loan) {
  const result = loan.days_late > 0
    ? `<span class="badge late">${tDays("loan.late", loan.days_late, { fine: money(loan.fine) })}</span>`
    : `<span class="badge on-time">${t("loan.on_time")}</span>`;
  return `
    <tr>
      <td>${bookCell(loan.book_title, loan.book_isbn)}</td>
      <td data-label="${t("table.borrower")}">${escapeHtml(loan.borrower)}</td>
      <td data-label="${t("table.loan_date")}">${formatDate(loan.loan_date)}</td>
      <td data-label="${t("table.return_date")}">${formatDate(loan.return_date)}</td>
      <td data-label="${t("table.result")}">${result}</td>
    </tr>
  `;
}

function renderLoans(list) {
  loans = list;
  const active = list.filter((loan) => loan.is_active);
  const returned = list.filter((loan) => !loan.is_active);

  document.getElementById("active-count").textContent = `(${active.length})`;
  document.getElementById("history-count").textContent = `(${returned.length})`;

  loanRows.innerHTML = active.length
    ? active.map(activeLoanRow).join("")
    : `<tr><td colspan="5" class="empty">${t("loans.empty_active")}</td></tr>`;
  historyRows.innerHTML = returned.length
    ? returned.map(returnedLoanRow).join("")
    : `<tr><td colspan="5" class="empty">${t("loans.empty_history")}</td></tr>`;
}

// --- Paneles con estado ----------------------------------------------------

function renderActivity(activity) {
  // Las claves del servidor ("loans") se traducen con "activity.loans".
  const rows = Object.entries(activity.counters)
    .map(([action, count]) => `
      <li><span>${t("activity." + action)}</span><strong>${count}</strong></li>
    `).join("");

  activityPanel.innerHTML = `
    <ul class="counters">
      ${rows || `<li class="empty">${t("activity.empty")}</li>`}
    </ul>
    <p class="footnote">
      ${t("activity.total")}: <strong>${activity.total}</strong>
      ${activity.last_action
        ? ` · ${t("activity.last", {
              action: t("activity." + activity.last_action),
              time: activity.last_action_at,
            })}`
        : ""}
    </p>
  `;
}

function renderWishlist(data) {
  wishlist = data.book_ids;

  // Cada libro de la lista dice si ahora mismo se puede pedir prestado.
  wishlistPanel.innerHTML = data.books.length === 0
    ? `<p class="empty">${t("wishlist.empty")}</p>`
    : `<ul class="chips">${data.books.map((book) =>
        `<li>${escapeHtml(book.title)}<span class="state ${book.available ? "" : "borrowed"}">${
          t(book.available ? "status.available" : "status.borrowed")}</span></li>`).join("")}</ul>`;

  wishlistPanel.innerHTML += `<p class="footnote">${
    t("wishlist.count", { count: data.books.length, max: data.max })
  }</p>`;
}

// --- Recarga general -------------------------------------------------------

async function reload() {
  // La lista de deseos se pide primero porque el catálogo necesita saber
  // qué libros están marcados para pintar la estrella.
  renderWishlist(await api("/api/wishlist"));

  const [bookList, loanList, activity] = await Promise.all([
    // El filtro lo aplica el servidor: GET /api/books?available=true.
    api(onlyAvailable.checked ? "/api/books?available=true" : "/api/books"),
    api("/api/loans"),
    api("/api/activity"),
  ]);

  // Los préstamos van antes: el catálogo dice a quién está prestado cada libro.
  renderLoans(loanList);
  renderBooks(bookList);
  renderActivity(activity);
}

// --- Acciones del usuario --------------------------------------------------

// Cada campo del formulario y el nombre que espera la API.
const BOOK_FIELDS = { title: "book-title", author: "book-author", year: "book-year", isbn: "book-isbn" };

function bookFormData() {
  return Object.fromEntries(Object.entries(BOOK_FIELDS)
    .map(([name, id]) => [name, document.getElementById(id).value]));
}

/** El formulario de agregar pasa a editar el libro elegido, con sus datos. */
function startEditing(book) {
  editingId = book.id;
  resetForm(bookForm);
  lookupResult.hidden = true;
  for (const [name, id] of Object.entries(BOOK_FIELDS)) {
    document.getElementById(id).value = book[name] ?? "";
  }
  document.getElementById("book-form-heading").textContent = t("form.edit_book", { title: book.title });
  document.getElementById("book-submit").textContent = t("form.save");
  document.getElementById("book-cancel").hidden = false;
  bookCard.classList.add("editing");
  bookCard.scrollIntoView({ block: "start" });
  document.getElementById("book-title").focus({ preventScroll: true });
}

/** Vuelve a dejar el formulario listo para agregar un libro nuevo. */
function stopEditing() {
  editingId = null;
  resetForm(bookForm);
  lookupResult.hidden = true;
  document.getElementById("book-form-heading").textContent = t("form.add_book");
  document.getElementById("book-submit").textContent = t("form.add");
  document.getElementById("book-cancel").hidden = true;
  bookCard.classList.remove("editing");
}

bookForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runAction(async () => {
    // Primera barrera: los regex en el navegador. Si algo falla no se envía nada.
    if (!formIsValid(bookForm)) return;

    // Mismo formulario, dos endpoints: POST crea un libro y PUT cambia uno.
    const editing = editingId !== null;
    const book = editing
      ? await sendJson("PUT", `/api/books/${editingId}`, bookFormData())
      : await sendJson("POST", "/api/books", bookFormData());
    stopEditing();
    await succeed(t(editing ? "msg.book_updated" : "msg.book_added", { title: book.title }));
  });
});

document.getElementById("book-cancel").addEventListener("click", stopEditing);

onlyAvailable.addEventListener("change", () => runAction(reload));

// Calculadora: llama a los dos endpoints STATELESS.
calcForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runAction(async () => {
    calcResult.hidden = true;

    const loanDate = document.getElementById("calc-loan-date").value;
    const days = document.getElementById("calc-days").value;
    const returnDate = document.getElementById("calc-return-date").value;

    const due = await api("/api/tools/due-date?"
      + new URLSearchParams({ loan_date: loanDate, days }));

    let html = t("calc.result", {
      loan_date: formatDate(due.loan_date),
      days: due.days,
      due_date: formatDate(due.due_date),
    });

    if (returnDate) {
      const penalty = await api("/api/tools/fine?"
        + new URLSearchParams({ due_date: due.due_date, reference_date: returnDate }));
      html += "<br>" + (penalty.days_late > 0
        ? t("calc.late", {
            date: formatDate(returnDate),
            days: penalty.days_late,
            fine: money(penalty.fine),
            rate: money(penalty.daily_rate),
          })
        : t("calc.ontime", { date: formatDate(returnDate) }));
    }

    calcResult.innerHTML = html;
    calcResult.hidden = false;
  });
});

document.getElementById("activity-reset").addEventListener("click", () => runAction(async () => {
  await api("/api/activity/reset", { method: "POST" });
  await succeed(t("msg.activity_reset"));
}));

document.getElementById("wishlist-clear").addEventListener("click", () => runAction(async () => {
  await api("/api/wishlist", { method: "DELETE" });
  await succeed(t("msg.wishlist_cleared"));
}));

/** Pregunta antes de devolver: qué libro, de quién, y si lleva multa. */
function confirmReturn(loan) {
  let question = t("confirm.return", {
    title: loan.book_title,
    isbn: loan.book_isbn || "—",
    borrower: loan.borrower,
  });
  if (loan.days_late > 0) {
    question += "\n" + tDays("confirm.return_late", loan.days_late, { fine: money(loan.fine) });
  }
  return confirm(question);
}

/** Lo que pasó al devolver: a tiempo, o con cuántos días de retraso y qué multa. */
function returnMessage(loan) {
  return loan.days_late > 0
    ? tDays("msg.book_returned_late", loan.days_late, { title: loan.book_title, fine: money(loan.fine) })
    : t("msg.book_returned", { title: loan.book_title });
}

// Botones de las tablas. Se pintan de nuevo en cada recarga, así que se
// escucha en el documento y cada botón dice qué hace con `data-action`.
const ROW_ACTIONS = {
  async wish(bookId) {
    const { title } = bookById(bookId);
    const result = await api(`/api/wishlist/${bookId}`, { method: "POST" });
    await succeed(t(result.in_wishlist ? "msg.wishlist_added" : "msg.wishlist_removed", { title }));
  },
  lend(bookId) {
    return openLoanForm(bookId);  // el préstamo se registra al enviar el formulario
  },
  edit(bookId) {
    startEditing(bookById(bookId));  // los cambios se guardan al enviar el formulario
  },
  async return(loanId) {
    const loan = loans.find((candidate) => candidate.id === loanId);
    if (!confirmReturn(loan)) return;
    const returned = await api(`/api/loans/${loanId}/return`, { method: "POST" });
    await succeed(returnMessage(returned));
  },
  async delete(bookId) {
    const { title } = bookById(bookId);
    if (!confirm(t("confirm.delete", { title }))) return;
    await api(`/api/books/${bookId}`, { method: "DELETE" });
    if (editingId === bookId) stopEditing();
    await succeed(t("msg.book_deleted_title", { title }));
  },
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = ROW_ACTIONS[button.dataset.action];
  runAction(() => action(Number(button.dataset.id)));
});


// ===========================================================================
//  CONSUMO DE UN SERVICIO EXTERNO DESDE EL FRONT END
//
//  Esta llamada sale del NAVEGADOR directamente a openlibrary.org. No pasa por
//  nuestro servidor Flask: es el propio cliente quien habla con el tercero.
//
//  Open Library es una API pública de Internet Archive. No necesita clave y
//  responde con la cabecera `Access-Control-Allow-Origin: *`, que es lo que
//  permite que un navegador la llame desde otro dominio.
//
//  Al ser un servicio ajeno hay que contar con que falle: se le pone un plazo
//  máximo de respuesta y se tratan por separado «no encontrado», «tardó
//  demasiado» y «no se pudo conectar». Y lo que devuelve se escapa igual que
//  lo nuestro: un servicio externo tampoco es de fiar.
// ===========================================================================

const OPEN_LIBRARY = "https://openlibrary.org/search.json";
const LOOKUP_TIMEOUT = 8000; // ms antes de darlo por perdido

function showLookup(html, kind) {
  lookupResult.className = "lookup-result " + kind;
  lookupResult.innerHTML = html;
  lookupResult.hidden = false;
}

/** Consulta un ISBN en Open Library. Devuelve los datos del libro o null. */
async function searchOpenLibrary(isbn) {
  // AbortController corta la petición si el servicio externo no responde.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT);

  const url = `${OPEN_LIBRARY}?q=isbn:${encodeURIComponent(isbn)}&limit=1`
            + `&fields=title,author_name,first_publish_year,cover_i`;

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("HTTP " + response.status);

    const data = await response.json();
    return data.docs && data.docs.length ? data.docs[0] : null;
  } finally {
    clearTimeout(timer);
  }
}

/** Pasa al formulario lo que devolvió Open Library y lo revalida. */
function fillBookForm(found) {
  const fields = {
    "book-title": found.title || "",
    "book-author": (found.author_name && found.author_name[0]) || "",
    "book-year": found.first_publish_year || "",
  };
  for (const [id, value] of Object.entries(fields)) {
    const input = document.getElementById(id);
    input.value = value;
    // Lo que llega de fuera tampoco se da por bueno sin comprobarlo.
    markField(input);
  }
}

document.getElementById("isbn-lookup").addEventListener("click", async () => {
  clearNotice();
  const isbnInput = document.getElementById("book-isbn");

  // Se reutiliza el mismo regex del servidor antes de molestar al tercero.
  if (!markField(isbnInput)) {
    lookupResult.hidden = true;  // que no quede a la vista un resultado viejo
    return;
  }

  const isbn = isbnInput.value.trim().replace(/[-\s]/g, "");
  showLookup(`<p class="searching">${t("ext.searching")}</p>`, "neutral");

  try {
    const found = await searchOpenLibrary(isbn);

    if (!found) {
      showLookup(`<p>${t("ext.not_found")}</p>`, "warning");
      return;
    }

    fillBookForm(found);

    const cover = found.cover_i
      ? `<img src="https://covers.openlibrary.org/b/id/${encodeURIComponent(found.cover_i)}-M.jpg"
              alt="${escapeHtml(found.title)}" class="cover">`
      : `<div class="cover missing">${t("ext.no_cover")}</div>`;

    showLookup(`
      ${cover}
      <div>
        <p><strong>${t("ext.found", { title: escapeHtml(found.title) })}</strong></p>
        <p>${t("ext.filled")}</p>
        <p class="source">${t("ext.source")}</p>
      </div>
    `, "ok");
  } catch (error) {
    const key = error.name === "AbortError" ? "ext.timeout" : "ext.error";
    showLookup(`<p>${t(key)}</p>`, "error");
  }
});


// ===========================================================================
//  CHAT POR WEBSOCKET
//
//  El resto de la aplicación usa fetch: el navegador pregunta y el servidor
//  contesta. Aquí la conexión se queda ABIERTA en los dos sentidos, así que el
//  servidor puede mandar un mensaje sin que nadie se lo haya pedido. Por eso
//  lo que escribe otra persona aparece al instante, sin recargar ni preguntar
//  cada pocos segundos.
//
//  No hay registro: la identidad es un apodo y un correo, y se guarda en
//  sessionStorage para no tener que teclearla otra vez al recargar.
// ===========================================================================

const IDENTITY_KEY = "chat-identity";

const chatJoinForm = document.getElementById("chat-join-form");
const chatSendForm = document.getElementById("chat-send-form");
const chatRoom = document.getElementById("chat-room");
const chatMessages = document.getElementById("chat-messages");
const chatStatus = document.getElementById("chat-status");
const chatError = document.getElementById("chat-error");
const chatText = document.getElementById("chat-text");
const chatMe = document.getElementById("chat-me");

let socket = null;
let identity = null;
let reconnectTimer = null;

// sessionStorage puede lanzar una excepción (modo privado, almacenamiento
// bloqueado). Sin él, el chat funciona igual: solo deja de recordar quién eres
// al recargar. Por eso estos tres `catch` no necesitan hacer nada más.
function saveIdentity(data) {
  try {
    sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(data));
  } catch {
    // Sin almacenamiento: la identidad dura lo que dure la página.
  }
}

function loadIdentity() {
  try {
    return JSON.parse(sessionStorage.getItem(IDENTITY_KEY) || "null");
  } catch {
    return null;
  }
}

function forgetIdentity() {
  try {
    sessionStorage.removeItem(IDENTITY_KEY);
  } catch {
    // Si no se pudo guardar, tampoco hay nada que borrar.
  }
}

/** ¿Está la conexión realmente abierta? */
function isConnected() {
  return socket !== null && socket.readyState === WebSocket.OPEN;
}

function showChatError(text) {
  chatError.textContent = text;
  chatError.hidden = false;
}

/** Envía por el socket solo si está abierto; si no, avisa y no revienta. */
function sendOverSocket(payload) {
  if (!isConnected()) {
    showChatError(t("chat.disconnected"));
    return false;
  }
  socket.send(JSON.stringify(payload));
  return true;
}

function sendJoin(nickname, email) {
  return sendOverSocket({ type: "join", name: nickname, email });
}

/** Bloquea los controles mientras no haya conexión. */
function setControlsEnabled(enabled) {
  chatText.disabled = !enabled;
  chatSendForm.querySelector("button").disabled = !enabled;
  chatJoinForm.querySelector("button").disabled = !enabled;
}

function renderStatus(key, kind) {
  chatStatus.textContent = t(key);
  chatStatus.className = "connection-status " + kind;
}

function appendLine(node) {
  const placeholder = chatMessages.querySelector(".empty");
  if (placeholder) placeholder.remove();
  chatMessages.appendChild(node);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderChatMessage(message) {
  const own = identity && message.email === identity.email;
  const item = document.createElement("li");
  item.className = "chat-message" + (own ? " own" : "");
  item.innerHTML = `
    <span class="avatar" style="background:${escapeHtml(message.color)}">${escapeHtml(message.initial)}</span>
    <div class="bubble">
      <p class="author">${escapeHtml(message.nickname)}${own ? ` (${t("chat.you")})` : ""}
         <span class="time">${escapeHtml(message.at)}</span></p>
      <p class="text">${escapeHtml(message.text)}</p>
    </div>`;
  appendLine(item);
}

function renderChatNotice(text) {
  const item = document.createElement("li");
  item.className = "chat-notice";
  item.textContent = text;
  appendLine(item);
}

function renderOnline(count) {
  document.getElementById("chat-online").textContent = t("chat.online", { count });
}

function enterRoom() {
  chatJoinForm.hidden = true;
  chatRoom.hidden = false;
  chatMe.textContent = identity.nickname;
  chatMe.style.background = identity.color;
  chatText.focus();
}

// Un manejador por cada tipo de mensaje que envía el servidor.
const SOCKET_HANDLERS = {
  welcome(data) {
    chatMessages.innerHTML = data.history.length
      ? "" : `<li class="empty">${t("chat.empty")}</li>`;
    data.history.forEach(renderChatMessage);
    renderOnline(data.online);
  },
  joined(data) {
    identity = data.identity;
    saveIdentity(identity);
    enterRoom();
  },
  message(data) {
    renderChatMessage(data.message);
  },
  system(data) {
    renderChatNotice(t(data.event === "join" ? "chat.joined" : "chat.left",
                       { nickname: data.nickname }));
  },
  online(data) {
    renderOnline(data.count);
  },
  error(data) {
    showChatError(data.error);
  },
};

function scheduleReconnect(delay) {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, delay);
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const lang = document.documentElement.lang || "es";
  // `ws` es ESTA conexión; `socket`, la vigente. Al salir del chat se
  // sustituye una por otra y la vieja no debe reconectarse por su cuenta.
  const ws = new WebSocket(`${protocol}//${location.host}/ws/chat?lang=${lang}`);
  socket = ws;

  ws.addEventListener("open", () => {
    renderStatus("chat.connected", "ok");
    setControlsEnabled(true);
    chatError.hidden = true;
    // Si ya había identidad guardada, se reenvía sin preguntar de nuevo.
    if (identity) sendJoin(identity.nickname, identity.email);
  });

  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    SOCKET_HANDLERS[data.type]?.(data);
  });

  ws.addEventListener("close", () => {
    if (ws !== socket) return;
    renderStatus("chat.disconnected", "error");
    setControlsEnabled(false);
    // Reconexión sencilla: si el servidor se reinicia, el chat vuelve solo.
    scheduleReconnect(2000);
  });

  ws.addEventListener("error", () => ws.close());
}

chatJoinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  chatError.hidden = true;
  if (!formIsValid(chatJoinForm)) return;

  sendJoin(
    document.getElementById("chat-nickname").value,
    document.getElementById("chat-email").value,
  );
});

chatSendForm.addEventListener("submit", (event) => {
  event.preventDefault();
  chatError.hidden = true;

  if (!chatText.value.trim()) return;

  if (sendOverSocket({ type: "message", text: chatText.value })) {
    chatText.value = "";
  }
});

document.getElementById("chat-leave").addEventListener("click", () => {
  forgetIdentity();
  identity = null;
  chatRoom.hidden = true;
  chatJoinForm.hidden = false;
  resetForm(chatJoinForm);

  // Cerrar y reabrir hace que el servidor avise de la salida a los demás.
  // Se suelta antes la conexión vieja para que su `close` no abra otra más.
  const previous = socket;
  socket = null;
  previous?.close();
  renderStatus("chat.connecting", "");
  setControlsEnabled(false);
  scheduleReconnect(100);
});

function startChat() {
  identity = loadIdentity();
  enableLiveValidation(chatJoinForm);
  if (identity) enterRoom();
  renderStatus("chat.connecting", "");
  setControlsEnabled(false);
  connect();
}

// --- Formulario de préstamo -----------------------------------------------

const loanOverlay = document.getElementById("loan-overlay");
const loanForm = document.getElementById("loan-form");
const loanDue = document.getElementById("loan-due");
let bookToLend = null;

/** Abre el diálogo con el libro que se va a prestar y su fecha de devolución. */
async function openLoanForm(bookId) {
  bookToLend = bookId;
  const book = bookById(bookId);

  document.getElementById("loan-book").textContent = t("loanform.book", {
    title: book.title,
    author: book.author,
    isbn: book.isbn || "—",
  });
  loanDue.textContent = "";

  resetForm(loanForm);
  loanOverlay.hidden = false;
  document.getElementById("loan-borrower").focus();

  // El plazo lo fija el servidor: se le pregunta a su función stateless, en
  // vez de repetir aquí los 15 días. Es solo informativo; si falla, el
  // formulario funciona igual y la fecha se ve al registrar el préstamo.
  try {
    const due = await api("/api/tools/due-date?" + new URLSearchParams({ loan_date: todayIso() }));
    loanDue.textContent = t("loanform.due", { days: due.days, date: formatDate(due.due_date) });
  } catch {
    loanDue.textContent = "";
  }
}

function closeLoanForm() {
  loanOverlay.hidden = true;
  bookToLend = null;
}

document.getElementById("loan-cancel").addEventListener("click", closeLoanForm);

// Cerrar pulsando fuera del cuadro o con la tecla Escape.
loanOverlay.addEventListener("click", (event) => {
  if (event.target === loanOverlay) closeLoanForm();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !loanOverlay.hidden) closeLoanForm();
});

loanForm.addEventListener("submit", (event) => {
  event.preventDefault();
  // Si el servidor rechaza algo que el navegador dio por bueno, runAction lo
  // muestra en el aviso.
  runAction(async () => {
    if (!formIsValid(loanForm)) return;

    const loan = await sendJson("POST", "/api/loans", {
      book_id: bookToLend,
      borrower: document.getElementById("loan-borrower").value,
      dni: document.getElementById("loan-dni").value,
      email: document.getElementById("loan-email").value,
      phone: document.getElementById("loan-phone").value,
    });
    closeLoanForm();
    await succeed(t("msg.loan_created", {
      title: loan.book_title,
      borrower: loan.borrower,
      date: formatDate(loan.due_date),
    }));
  });
});

// Cambiar de idioma: el servidor lo guarda en la sesión y se recarga la página
// para que también los textos fijos (los que pinta Jinja) vengan traducidos.
document.getElementById("language-select").addEventListener("change", (event) => {
  runAction(async () => {
    await api(`/api/i18n/${event.target.value}`, { method: "POST" });
    // Se navega SIN ?lang= en la URL: si se recargara tal cual, ese parámetro
    // volvería a imponer el idioma anterior y anularía el cambio recién hecho.
    window.location.href = window.location.pathname;
  });
});

// Al abrir la página, la calculadora se rellena con la fecha de hoy.
document.getElementById("calc-loan-date").value = todayIso();

/** Arranque: primero el catálogo de traducciones, después los datos. */
async function start() {
  // El catálogo de idioma y los patrones de validación, antes de pintar nada.
  const [i18n, validation] = await Promise.all([
    api("/api/i18n"),
    api("/api/validation-rules"),
  ]);

  messages = i18n.messages;
  rules = validation.patterns;
  document.documentElement.lang = i18n.lang;

  enableLiveValidation(bookForm);
  enableLiveValidation(loanForm);

  await reload();
  startChat();
}

// Si el arranque falla (servidor caído, respuesta inesperada), se avisa en la
// página en vez de dejar el error escondido en la consola.
runAction(start);
