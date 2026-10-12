// MOSTRADOR DEL BIBLIOTECARIO
//
// Dos pestañas: Préstamos (qué libros están fuera, quién los tiene y cuándo
// vuelven) y Catálogo (los libros, con sus acciones). Al lado, siempre, el chat
// con los lectores. Prestar, recibir, agregar y editar se hacen en ventanas
// que no sacan al bibliotecario de donde está.

import {
  api, confirmAction, coverHtml, daysUntil, enableLiveValidation, escapeHtml, fieldIsValid,
  formatDate, formIsValid, markField, money, notify, resetForm, runAction, runInDialog,
  sendJson, start, t, tn, todayIso,
} from "./core.js";
import { startChat } from "./chat.js";

// Las acciones que cuenta el servidor, en el orden en que se muestran.
const ACTIVITY_ACTIONS = ["loans", "returns", "books_created", "books_updated", "books_deleted"];
const TABS = ["loans", "catalog"];

let books = [];  // último catálogo recibido
let loans = [];  // préstamos activos e historial

const onlyAvailable = document.getElementById("only-available");

const bookById = (id) => books.find((book) => book.id === id);
const loanById = (id) => loans.find((loan) => loan.id === id);
const activeLoanFor = (bookId) => loans.find((loan) => loan.is_active && loan.book_id === bookId);

// --- Pestañas -----------------------------------------------------------------

function showTab(name) {
  const selected = TABS.includes(name) ? name : TABS[0];
  for (const id of TABS) {
    const link = document.getElementById("tab-" + id);
    document.getElementById(id).hidden = id !== selected;
    link.classList.toggle("active", id === selected);
    link.setAttribute("aria-selected", String(id === selected));
  }
}

document.querySelectorAll(".tab").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const name = link.getAttribute("href").slice(1);
    // La pestaña queda en la URL: al recargar se vuelve a la misma.
    history.replaceState(null, "", "#" + name);
    showTab(name);
  });
});

// --- Actividad (contadores del servidor) ------------------------------------

function renderActivity(activity) {
  document.getElementById("activity-stats").innerHTML = ACTIVITY_ACTIONS.map((action) => `
    <div class="stat">
      <span class="stat-value">${activity.counters[action] ?? 0}</span>
      <span class="stat-label">${t("activity." + action)}</span>
    </div>`).join("");

  document.getElementById("activity-last").textContent = activity.last_action
    ? t("activity.last." + activity.last_action, { time: activity.last_action_at })
    : t("activity.empty");
}

// --- Préstamos ----------------------------------------------------------------

/** Cuánto le queda, o cuánto lleva de retraso. */
function duePill(loan) {
  if (loan.days_late > 0) {
    return `<span class="pill danger">${tn("loan.overdue", loan.days_late, { days: loan.days_late })}</span>`;
  }
  const left = Math.max(0, daysUntil(loan.due_date));
  const text = left === 0 ? t("loan.due_today") : tn("loan.due_in", left, { days: left });
  return `<span class="pill ${left <= 2 ? "warn" : "ok"}">${text}</span>`;
}

function contactOf(loan) {
  return [loan.borrower_phone, loan.borrower_email].filter(Boolean).map(escapeHtml).join(" · ");
}

function loanCard(loan) {
  const late = loan.days_late > 0;
  const dueLine = late
    ? t("loan.fine_so_far", { fine: money(loan.fine) })
    : t("loan.due_on", { date: formatDate(loan.due_date) });
  return `
    <li class="loan-card ${late ? "late" : ""}">
      ${coverHtml(loan, "sm")}
      <div class="loan-book">
        <p class="title">${escapeHtml(loan.book_title)}</p>
        <p class="meta isbn">ISBN ${escapeHtml(loan.book_isbn || "—")}</p>
        <p class="meta">${t("loan.lent_on", { date: formatDate(loan.loan_date) })}</p>
      </div>
      <div class="loan-person">
        <p class="name">${escapeHtml(loan.borrower)}</p>
        <p class="meta">${contactOf(loan)}</p>
      </div>
      <div class="loan-due">
        ${duePill(loan)}
        <p class="meta ${late ? "late" : ""}">${dueLine}</p>
      </div>
      <button class="btn secondary" data-action="return" data-id="${loan.id}">${t("action.receive")}</button>
    </li>`;
}

function historyRow(loan) {
  const result = loan.days_late > 0
    ? `<span class="pill danger">${tn("loan.late", loan.days_late, { days: loan.days_late, fine: money(loan.fine) })}</span>`
    : `<span class="pill ok">${t("loan.on_time")}</span>`;
  return `
    <tr>
      <td><span class="title">${escapeHtml(loan.book_title)}</span>
          <span class="meta isbn">ISBN ${escapeHtml(loan.book_isbn || "—")}</span></td>
      <td data-label="${t("table.borrower")}">${escapeHtml(loan.borrower)}</td>
      <td data-label="${t("table.loan_date")}">${formatDate(loan.loan_date)}</td>
      <td data-label="${t("table.return_date")}">${formatDate(loan.return_date)}</td>
      <td data-label="${t("table.result")}">${result}</td>
    </tr>`;
}

/** Primero los vencidos (el más atrasado arriba); después, el que vence antes. */
function byUrgency(a, b) {
  return b.days_late - a.days_late || a.due_date.localeCompare(b.due_date);
}

function renderLoans(list) {
  loans = list;
  const active = list.filter((loan) => loan.is_active).sort(byUrgency);
  const returned = list.filter((loan) => !loan.is_active);

  document.getElementById("loan-list").innerHTML = active.length
    ? active.map(loanCard).join("")
    : `<li class="empty">${t("loans.empty_active")}</li>`;
  document.getElementById("history-rows").innerHTML = returned.length
    ? returned.map(historyRow).join("")
    : `<tr><td colspan="5" class="empty">${t("loans.empty_history")}</td></tr>`;

  const count = document.getElementById("loans-count");
  count.textContent = active.length;
  // La pestaña avisa en rojo si hay algún préstamo vencido.
  count.classList.toggle("alert", active.some((loan) => loan.days_late > 0));
  document.getElementById("history-count").textContent = `(${returned.length})`;
}

// --- Catálogo -----------------------------------------------------------------

function bookStatus(book, loan) {
  if (book.available) return `<span class="pill ok">${t("status.available")}</span>`;
  const late = loan && loan.days_late > 0;
  const detail = loan
    ? `<p class="meta ${late ? "late" : ""}">${t(late ? "catalog.lent_overdue" : "catalog.lent_to", {
        borrower: escapeHtml(loan.borrower), date: formatDate(loan.due_date),
      })}</p>`
    : "";
  return `<span class="pill ${late ? "danger" : "warn"}">${t(late ? "status.overdue" : "status.borrowed")}</span>${detail}`;
}

function bookRow(book) {
  const loan = activeLoanFor(book.id);
  // Un libro disponible se presta; uno prestado se recibe desde aquí mismo.
  const main = loan
    ? `<button class="btn secondary sm" data-action="return" data-id="${loan.id}">${t("action.return")}</button>`
    : book.available
      ? `<button class="btn primary sm" data-action="lend" data-id="${book.id}">${t("action.lend")}</button>`
      : "";
  // Un libro prestado no se puede eliminar: el botón lo dice antes de intentarlo.
  const blocked = book.available ? "" : `disabled title="${escapeHtml(t("action.delete_blocked"))}"`;
  return `
    <li class="book-row">
      ${coverHtml(book, "sm")}
      <div class="book-info">
        <p class="title">${escapeHtml(book.title)}</p>
        <p class="meta">${escapeHtml(book.author)}${book.year ? ` · ${book.year}` : ""}</p>
        <p class="meta isbn">ISBN ${escapeHtml(book.isbn || "—")}</p>
      </div>
      <div class="book-status">${bookStatus(book, loan)}</div>
      <div class="book-actions">
        ${main}
        <button class="btn ghost sm" data-action="edit" data-id="${book.id}">${t("action.edit")}</button>
        <button class="btn ghost sm danger-text" data-action="delete" data-id="${book.id}" ${blocked}>${t("action.delete")}</button>
      </div>
    </li>`;
}

function renderBooks(list) {
  books = list;
  const empty = onlyAvailable.checked ? "catalog.empty_available" : "catalog.empty";
  document.getElementById("book-list").innerHTML = list.length
    ? list.map(bookRow).join("")
    : `<li class="empty">${t(empty)}</li>`;
  document.getElementById("books-count").textContent = list.length;
}

// --- Recarga ------------------------------------------------------------------

async function reload() {
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

// Cuando el servidor avisa por el WebSocket de que algo cambió (lo hizo otro
// bibliotecario, o esta misma pestaña), se vuelve a pedir todo una sola vez.
let reloadTimer = null;
function reloadSoon() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => runAction(reload), 250);
}

onlyAvailable.addEventListener("change", () => runAction(reload));

// --- Recibir un libro ---------------------------------------------------------

function returnMessage(loan) {
  return loan.days_late > 0
    ? tn("msg.book_returned_late", loan.days_late,
         { title: loan.book_title, days: loan.days_late, fine: money(loan.fine) })
    : t("msg.book_returned", { title: loan.book_title });
}

async function receive(loan) {
  const late = loan.days_late > 0;
  const verdict = late
    ? tn("confirm.return_late", loan.days_late, { days: loan.days_late, fine: money(loan.fine) })
    : t("confirm.return_on_time");
  const confirmed = await confirmAction({
    title: t("confirm.return_heading", { title: loan.book_title }),
    body: `
      <div class="confirm-book">
        ${coverHtml(loan, "sm")}
        <p>${escapeHtml(t("confirm.return_body", {
          borrower: loan.borrower, date: formatDate(loan.loan_date), due: formatDate(loan.due_date),
        }))}</p>
      </div>
      <p class="callout ${late ? "danger" : "ok"}">${escapeHtml(verdict)}</p>`,
    ok: t("confirm.return_ok"),
  });
  if (!confirmed) return;
  const returned = await api(`/api/loans/${loan.id}/return`, { method: "POST" });
  notify(returnMessage(returned));
  await reload();
}

// --- Eliminar un libro --------------------------------------------------------

async function removeBook(book) {
  const confirmed = await confirmAction({
    title: t("confirm.delete_heading", { title: book.title }),
    body: `<p>${escapeHtml(t("confirm.delete_body"))}</p>`,
    ok: t("confirm.delete_ok"),
    danger: true,
  });
  if (!confirmed) return;
  await api(`/api/books/${book.id}`, { method: "DELETE" });
  notify(t("msg.book_deleted_title", { title: book.title }));
  await reload();
}

// ===========================================================================
//  AGREGAR O EDITAR UN LIBRO, CON OPEN LIBRARY
//
//  Se empieza por el ISBN: en cuanto tiene un formato válido, el NAVEGADOR
//  consulta openlibrary.org directamente (sin pasar por Flask) y rellena el
//  título, el autor y el año. Open Library es una API pública que responde con
//  `Access-Control-Allow-Origin: *`, que es lo que permite llamarla desde otro
//  dominio.
//
//  Al ser un servicio ajeno hay que contar con que falle: se le pone un plazo
//  y se distinguen «no lo tiene», «tardó demasiado» y «no hubo conexión». En
//  los tres casos se puede seguir a mano. Lo que devuelve se escapa y se
//  valida igual que lo que escribe una persona.
// ===========================================================================

const OPEN_LIBRARY = "https://openlibrary.org/search.json";
const LOOKUP_TIMEOUT = 8000;  // ms antes de darlo por perdido

const bookDialog = document.getElementById("book-dialog");
const bookForm = document.getElementById("book-form");
const isbnInput = document.getElementById("book-isbn");
const titleInput = document.getElementById("book-title");
const authorInput = document.getElementById("book-author");
const yearInput = document.getElementById("book-year");
const lookupBox = document.getElementById("lookup-result");

let editingId = null;   // libro que se edita; null si se agrega uno nuevo
let lookedUp = "";      // último ISBN consultado, para no repetir la consulta
let lookupTimer = null;

const cleanIsbn = (value) => value.trim().replace(/[-\s]/g, "");

function openBookDialog(book = null) {
  editingId = book ? book.id : null;
  resetForm(bookForm);
  bookDialog.querySelector(".dialog-error").hidden = true;
  lookupBox.hidden = true;
  lookedUp = book?.isbn || "";
  if (book) {
    isbnInput.value = book.isbn || "";
    titleInput.value = book.title;
    authorInput.value = book.author;
    yearInput.value = book.year ?? "";
  }
  document.getElementById("book-dialog-title").textContent = book
    ? t("book.edit_heading", { title: book.title })
    : t("book.add_heading");
  document.getElementById("book-submit").textContent = t(book ? "book.submit_edit" : "book.submit_add");
  bookDialog.showModal();
  (book ? titleInput : isbnInput).focus();
}

function showLookup(html, kind) {
  lookupBox.className = "lookup " + kind;
  lookupBox.innerHTML = html;
  lookupBox.hidden = false;
}

/** Consulta un ISBN en Open Library. Devuelve los datos del libro o null. */
async function searchOpenLibrary(isbn) {
  // AbortController corta la petición si el servicio externo no responde.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT);
  const url = `${OPEN_LIBRARY}?q=isbn:${encodeURIComponent(isbn)}&limit=1`
            + "&fields=title,author_name,first_publish_year,cover_i";
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    return data.docs && data.docs.length ? data.docs[0] : null;
  } finally {
    clearTimeout(timer);
  }
}

/** Pasa al formulario lo que devolvió Open Library y lo valida. Al agregar
 *  se rellena todo; al editar, solo lo que esté vacío. */
function fillBookForm(found, overwrite) {
  const values = [
    [titleInput, found.title || ""],
    [authorInput, (found.author_name && found.author_name[0]) || ""],
    [yearInput, found.first_publish_year || ""],
  ];
  for (const [input, value] of values) {
    if (value && (overwrite || !input.value.trim())) {
      input.value = value;
      // Lo que llega de fuera tampoco se da por bueno sin comprobarlo.
      markField(input);
    }
  }
}

function foundHtml(found) {
  const cover = found.cover_i
    ? `<img class="cover cover-sm" alt="" data-title="${escapeHtml(found.title)}"
            src="https://covers.openlibrary.org/b/id/${encodeURIComponent(found.cover_i)}-M.jpg">`
    : coverHtml({ title: found.title }, "sm");
  const author = found.author_name ? found.author_name[0] : "";
  return `
    ${cover}
    <div>
      <p><strong>${t("ext.found")}</strong></p>
      <p>${escapeHtml(found.title)}${author ? ` · ${escapeHtml(author)}` : ""}
         ${found.first_publish_year ? ` · ${escapeHtml(found.first_publish_year)}` : ""}</p>
      <p class="muted small">${t("ext.filled")}</p>
    </div>`;
}

async function lookUp(overwrite) {
  const isbn = cleanIsbn(isbnInput.value);
  lookedUp = isbn;
  showLookup(`<p class="searching">${t("ext.searching")}</p>`, "neutral");
  try {
    const found = await searchOpenLibrary(isbn);
    if (cleanIsbn(isbnInput.value) !== isbn) return;  // el ISBN cambió mientras tanto
    if (!found) {
      showLookup(`<p>${t("ext.not_found")}</p>`, "warning");
      return;
    }
    fillBookForm(found, overwrite);
    showLookup(foundHtml(found), "ok");
  } catch (error) {
    showLookup(`<p>${t(error.name === "AbortError" ? "ext.timeout" : "ext.error")}</p>`, "error");
  }
}

// En cuanto el ISBN tiene un formato válido se consulta solo, sin pulsar nada.
isbnInput.addEventListener("input", () => {
  clearTimeout(lookupTimer);
  if (fieldIsValid(isbnInput) && cleanIsbn(isbnInput.value) !== lookedUp) {
    lookupTimer = setTimeout(() => lookUp(editingId === null), 400);
  }
});

// El botón vuelve a consultar aunque ya se hubiera hecho, y siempre rellena.
document.getElementById("isbn-lookup").addEventListener("click", () => {
  clearTimeout(lookupTimer);
  if (!markField(isbnInput, true)) {
    lookupBox.hidden = true;
    return;
  }
  lookUp(true);
});

bookForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runInDialog(bookDialog, async () => {
    // Primera barrera: los regex en el navegador. Si algo falla no se envía nada.
    if (!formIsValid(bookForm)) return;
    const data = {
      title: titleInput.value, author: authorInput.value, year: yearInput.value, isbn: isbnInput.value,
    };
    // Mismo formulario, dos endpoints: POST crea un libro y PUT cambia uno.
    const editing = editingId !== null;
    const book = editing
      ? await sendJson("PUT", `/api/books/${editingId}`, data)
      : await sendJson("POST", "/api/books", data);
    bookDialog.close();
    notify(t(editing ? "msg.book_updated" : "msg.book_added", { title: book.title }));
    await reload();
  });
});

document.getElementById("add-book").addEventListener("click", () => openBookDialog());

// ===========================================================================
//  NUEVO PRÉSTAMO
//  Se elige el libro (o llega elegido desde el catálogo), se ve hasta cuándo
//  se presta y se escriben los datos de quien se lo lleva. Los cuatro campos
//  se validan con los regex del servidor, primero aquí y después allí.
// ===========================================================================

const loanDialog = document.getElementById("loan-dialog");
const loanForm = document.getElementById("loan-form");
const loanBook = document.getElementById("loan-book");
const loanSummary = document.getElementById("loan-summary");
let dueRequest = 0;  // para ignorar una respuesta que llegue tarde

async function renderLoanSummary() {
  const book = bookById(Number(loanBook.value));
  if (!book) {
    loanSummary.innerHTML = "";
    return;
  }
  const ticket = ++dueRequest;
  loanSummary.innerHTML = `
    ${coverHtml(book, "sm")}
    <div>
      <p class="title">${escapeHtml(book.title)}</p>
      <p class="meta">${escapeHtml(book.author)} · ISBN ${escapeHtml(book.isbn || "—")}</p>
      <p class="due" id="loan-due"></p>
    </div>`;
  // El vencimiento lo calcula la función sin estado del servidor.
  try {
    const due = await api("/api/tools/due-date?" + new URLSearchParams({ loan_date: todayIso() }));
    if (ticket !== dueRequest) return;
    document.getElementById("loan-due").textContent =
      t("loanform.due", { date: formatDate(due.due_date), days: due.days });
  } catch {
    // Sin la fecha a la vista, el préstamo se puede registrar igual.
  }
}

function openLoanDialog(bookId = null) {
  resetForm(loanForm);
  loanDialog.querySelector(".dialog-error").hidden = true;
  const available = books.filter((book) => book.available);
  loanBook.innerHTML = available.length
    ? available.map((book) => `<option value="${book.id}">${escapeHtml(book.title)} — ${escapeHtml(book.author)}</option>`).join("")
    : `<option value="">${t("loanform.no_books")}</option>`;
  loanBook.disabled = available.length === 0;
  document.getElementById("loan-submit").disabled = available.length === 0;
  if (bookId) loanBook.value = String(bookId);
  loanDialog.showModal();
  (bookId ? document.getElementById("loan-borrower") : loanBook).focus();
  renderLoanSummary();
}

loanBook.addEventListener("change", renderLoanSummary);

loanForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runInDialog(loanDialog, async () => {
    if (!formIsValid(loanForm)) return;
    const loan = await sendJson("POST", "/api/loans", {
      book_id: Number(loanBook.value),
      borrower: document.getElementById("loan-borrower").value,
      dni: document.getElementById("loan-dni").value,
      email: document.getElementById("loan-email").value,
      phone: document.getElementById("loan-phone").value,
    });
    loanDialog.close();
    notify(t("msg.loan_created", {
      title: loan.book_title, borrower: loan.borrower, date: formatDate(loan.due_date),
    }));
    await reload();
  });
});

document.getElementById("new-loan").addEventListener("click", () => openLoanDialog());

// --- Botones de las listas ----------------------------------------------------
// Se pintan de nuevo en cada recarga, así que se escucha en el documento y
// cada botón dice qué hace con `data-action`.

const ACTIONS = {
  lend: (id) => openLoanDialog(id),
  return: (id) => receive(loanById(id)),
  edit: (id) => openBookDialog(bookById(id)),
  delete: (id) => removeBook(bookById(id)),
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  const action = button && ACTIONS[button.dataset.action];
  if (action) runAction(() => action(Number(button.dataset.id)));
});

document.getElementById("activity-reset").addEventListener("click", () => runAction(async () => {
  await api("/api/activity/reset", { method: "POST" });
  notify(t("msg.activity_reset"));
  await reload();
}));

// --- Arranque -------------------------------------------------------------------

await start();
enableLiveValidation(bookForm);
enableLiveValidation(loanForm);
showTab(location.hash.slice(1));
await runAction(reload);
startChat({ catalogChanged: reloadSoon });
