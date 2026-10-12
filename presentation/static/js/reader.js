// VISTA DEL LECTOR
//
// Arriba, su carnet: si está vigente y qué libro tiene ahora. Debajo, el
// catálogo para consultar (con búsqueda): qué hay, qué está disponible y
// cuándo vuelve lo prestado. El lector no presta: guarda lo que le interesa en
// su lista y se lo pide al bibliotecario por su chat privado, siempre al lado.

import {
  api, avatarColor, coverHtml, daysUntil, escapeHtml, formatDate, money, notify, runAction,
  start, t, tn, todayIso,
} from "./core.js";
import { prefillChat, startChat } from "./chat.js";

let books = [];
let wishlist = { book_ids: [], books: [], max: 0 };
let me = null;  // su cuenta: carnet, vigencia y préstamos (de /api/readers/me)

const onlyAvailable = document.getElementById("only-available");
const search = document.getElementById("book-search");

// Un libro puede estar en la lista aunque la búsqueda lo oculte del catálogo.
const findBook = (id) => books.find((book) => book.id === id)
  || wishlist.books.find((book) => book.id === id);

// --- Mi carnet -----------------------------------------------------------------

/** Por qué no puede pedir un libro ahora, o null si puede. */
function blockedNote() {
  if (!me) return null;
  if (!me.card_valid) return t("me.card_expired_note");
  if (!me.can_borrow) return t("me.has_loan_note");
  return null;
}

function loanText(loan) {
  return loan.days_late > 0
    ? t("me.loan_late", { title: escapeHtml(loan.book_title), date: formatDate(loan.due_date), fine: money(loan.fine) })
    : t("me.loan", { title: escapeHtml(loan.book_title), date: formatDate(loan.due_date) });
}

function renderMyCard() {
  const loan = me.active_loans[0];
  const card = me.card_valid
    ? `<span class="pill ok">${t("reader.card_valid")}</span>
       <span class="meta">${t("reader.valid_until", { date: formatDate(me.card_expires) })}</span>`
    : `<span class="pill danger">${t("reader.card_expired")}</span>
       <span class="meta late">${t("reader.expired_on", { date: formatDate(me.card_expires) })}</span>`;
  const note = blockedNote();
  document.getElementById("my-card-body").innerHTML = `
    <div class="my-card-who">
      <span class="avatar" style="background:${avatarColor(me.username)}">${escapeHtml(me.name.charAt(0))}</span>
      <div>
        <p class="title">${escapeHtml(me.name)}</p>
        <p class="meta">${t("reader.card", { number: escapeHtml(me.card_number || "—") })}</p>
      </div>
    </div>
    <div class="my-card-state">${card}</div>
    <div class="my-card-loan ${loan && loan.days_late > 0 ? "late" : ""}">
      ${loan ? coverHtml(loan, "xs") : ""}
      <p>${loan ? loanText(loan) : t("me.no_loan")}</p>
    </div>
    ${note ? `<p class="my-card-note">${note}</p>` : ""}`;
}

// --- Catálogo ------------------------------------------------------------------

/** Disponible, o cuándo vuelve. Nunca a quién está prestado. */
function availability(book) {
  if (book.available) return { kind: "ok", text: t("status.available") };
  if (!book.due_date) return { kind: "warn", text: t("status.borrowed") };
  const late = daysUntil(book.due_date) < 0;
  return {
    kind: late ? "danger" : "warn",
    text: t(late ? "catalog.back_late" : "catalog.back_on", { date: formatDate(book.due_date) }),
  };
}

function starButton(book) {
  const wished = wishlist.book_ids.includes(book.id);
  const label = escapeHtml(t(wished ? "action.wishlist_remove" : "action.wishlist_add"));
  return `<button class="star ${wished ? "active" : ""}" data-action="wish" data-id="${book.id}"
                  aria-pressed="${wished}" title="${label}" aria-label="${label}">${wished ? "★" : "☆"}</button>`;
}

/** «Pedir» deja el mensaje escrito en el chat. Si ahora no se le puede
 *  prestar nada, el botón está bloqueado y dice por qué. */
function requestButton(book, extra = "") {
  const note = blockedNote();
  const title = escapeHtml(note || t("action.request_title"));
  return `<button class="btn tonal sm ${extra}" data-action="request" data-id="${book.id}"
                  title="${title}" ${note ? "disabled" : ""}>${t("action.request")}</button>`;
}

function bookCard(book) {
  const state = availability(book);
  return `
    <li class="book-card">
      <div class="cover-wrap">
        ${coverHtml(book, "lg")}
        ${starButton(book)}
      </div>
      <p class="title">${escapeHtml(book.title)}</p>
      <p class="meta">${escapeHtml(book.author)}${book.year ? ` · ${book.year}` : ""}</p>
      <span class="pill ${state.kind}">${state.text}</span>
      ${book.available ? requestButton(book, "block") : ""}
    </li>`;
}

function emptyCatalogText() {
  const query = search.value.trim();
  if (query) return t("catalog.no_results", { query: escapeHtml(query) });
  return t(onlyAvailable.checked ? "catalog.empty_available" : "catalog.empty");
}

function renderCatalog() {
  document.getElementById("book-grid").innerHTML = books.length
    ? books.map(bookCard).join("")
    : `<li class="empty">${emptyCatalogText()}</li>`;
  document.getElementById("books-count").textContent = books.length;
}

// --- Mi lista ----------------------------------------------------------------------

function wishItem(book) {
  const state = availability(book);
  return `
    <li class="wish-item">
      ${coverHtml(book, "xs")}
      <div class="wish-info">
        <p class="title">${escapeHtml(book.title)}</p>
        <p class="meta state-${state.kind}">${state.text}</p>
      </div>
      ${book.available ? requestButton(book) : ""}
      <button class="icon-btn" data-action="wish" data-id="${book.id}"
              title="${escapeHtml(t("action.wishlist_remove"))}" aria-label="${escapeHtml(t("action.wishlist_remove"))}">×</button>
    </li>`;
}

function renderWishlist() {
  document.getElementById("wish-list").innerHTML = wishlist.books.length
    ? wishlist.books.map(wishItem).join("")
    : `<li class="empty">${t("wishlist.empty")}</li>`;
  document.getElementById("wishlist-count").textContent =
    t("wishlist.count", { count: wishlist.books.length, max: wishlist.max });
  document.getElementById("wishlist-clear").hidden = wishlist.books.length === 0;
}

// --- Recarga -------------------------------------------------------------------------

/** El catálogo con la búsqueda y el filtro: los aplica el servidor. */
function booksUrl() {
  const params = new URLSearchParams();
  const query = search.value.trim();
  if (query) params.set("q", query);
  if (onlyAvailable.checked) params.set("available", "true");
  return "/api/books?" + params;
}

async function reload() {
  const [bookList, saved, account] = await Promise.all([
    api(booksUrl()),
    api("/api/wishlist"),
    api("/api/readers/me"),
  ]);
  books = bookList;
  wishlist = saved;
  me = account;
  renderMyCard();
  renderCatalog();
  renderWishlist();
}

async function reloadBooks() {
  books = await api(booksUrl());
  renderCatalog();
}

// El servidor avisa por el WebSocket cuando se presta o se devuelve un libro,
// o cuando le renuevan el carnet: todo se actualiza sin recargar la página.
let reloadTimer = null;
function reloadSoon() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => runAction(reload), 250);
}

onlyAvailable.addEventListener("change", () => runAction(reloadBooks));

// Se busca mientras se escribe, pero se espera a que se deje de teclear.
let searchTimer = null;
search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runAction(reloadBooks), 250);
});

// --- Acciones -------------------------------------------------------------------

const ACTIONS = {
  // Lista de deseos: vive en la sesión (función con estado), solo de este navegador.
  async wish(id) {
    const { title } = findBook(id);
    const result = await api(`/api/wishlist/${id}`, { method: "POST" });
    notify(t(result.in_wishlist ? "msg.wishlist_added" : "msg.wishlist_removed", { title }));
    await reload();
  },
  // Pedir un libro es escribirle al bibliotecario: el mensaje queda listo
  // en el chat para revisarlo y enviarlo.
  request(id) {
    const book = findBook(id);
    prefillChat(t("chat.request", { title: book.title, isbn: book.isbn || "—" }));
  },
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  const action = button && ACTIONS[button.dataset.action];
  if (action) runAction(() => action(Number(button.dataset.id)));
});

document.getElementById("wishlist-clear").addEventListener("click", () => runAction(async () => {
  await api("/api/wishlist", { method: "DELETE" });
  notify(t("msg.wishlist_cleared"));
  await reload();
}));

// ===========================================================================
//  PLAZOS Y MULTAS — usa las dos funciones SIN ESTADO del servidor.
//  Con las mismas fechas devuelven siempre lo mismo y no guardan nada, así
//  que se pueden llamar cada vez que cambia una fecha.
// ===========================================================================

const pickedUp = document.getElementById("terms-loan-date");
const returned = document.getElementById("terms-return-date");

const strong = (text) => `<strong>${escapeHtml(text)}</strong>`;

async function updateTerms() {
  const due = await api("/api/tools/due-date?"
    + new URLSearchParams({ loan_date: pickedUp.value || todayIso() }));
  let html = `<p>${t("terms.due", { date: strong(formatDate(due.due_date)) })}</p>`;

  if (returned.value) {
    const penalty = await api("/api/tools/fine?"
      + new URLSearchParams({ due_date: due.due_date, reference_date: returned.value }));
    const date = formatDate(returned.value);
    html += penalty.days_late > 0
      ? `<p class="late">${tn("terms.late", penalty.days_late,
          { date, days: penalty.days_late, fine: strong(money(penalty.fine)) })}</p>`
      : `<p class="on-time">${t("terms.on_time", { date })}</p>`;
  }
  document.getElementById("terms-result").innerHTML = html;
}

/** El resumen de las condiciones: el plazo y la multa diaria los dice el
 *  servidor, no se escriben aquí. */
async function startTerms() {
  const today = todayIso();
  const [due, penalty] = await Promise.all([
    api("/api/tools/due-date?" + new URLSearchParams({ loan_date: today })),
    api("/api/tools/fine?" + new URLSearchParams({ due_date: today, reference_date: today })),
  ]);
  document.getElementById("terms-summary").innerHTML = t("terms.summary", {
    days: strong(due.days), rate: strong(money(penalty.daily_rate)),
  });
  pickedUp.value = today;
  await updateTerms();
}

pickedUp.addEventListener("change", () => runAction(updateTerms));
returned.addEventListener("change", () => runAction(updateTerms));

// --- Arranque -------------------------------------------------------------------

await start();
await runAction(reload);
runAction(startTerms);
startChat({ refresh: reloadSoon });
