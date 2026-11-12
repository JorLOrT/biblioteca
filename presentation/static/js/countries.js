// PAÍSES E IDIOMAS
//
// Dos desplegables encadenados y una tabla. Al elegir una región se vuelve a
// llenar la lista de países; al elegir un país se muestra la tabla con sus
// idiomas y el nombre de cada uno en su propia lengua. El navegador solo habla
// con /api/countries: es el servidor quien consulta countries.dev.

import { api, escapeHtml, notify, start, t, tn } from "./core.js";

const regionSelect = document.getElementById("region-select");
const countrySelect = document.getElementById("country-select");
const result = document.getElementById("country-result");
const count = document.getElementById("countries-count");

const lang = document.documentElement.lang;
const collator = new Intl.Collator(lang);

// Si se cambia de región (o de país) antes de que llegue la respuesta
// anterior, esa respuesta ya no sirve: solo se pinta la de la última petición.
let regionRequest = 0;
let countryRequest = 0;

function option(value, text) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`;
}

function showEmpty(key) {
  result.innerHTML = `<p class="empty">${t(key)}</p>`;
}

/** El nombre del idioma en el idioma de la página («Spanish» → «español»).
 *  El servicio solo lo da en inglés; si el navegador no lo conoce, se deja así. */
function languageName(language) {
  if (!language.code) return language.name;
  try {
    return new Intl.DisplayNames([lang], { type: "language" }).of(language.code) || language.name;
  } catch {
    return language.name;
  }
}

// --- Región → países -------------------------------------------------------------

async function loadCountries() {
  const request = ++regionRequest;
  countryRequest++;  // la tabla del país anterior ya no corresponde
  count.textContent = "";
  countrySelect.disabled = true;
  showEmpty("countries.empty");

  if (!regionSelect.value) {
    countrySelect.innerHTML = option("", t("countries.pick_region_first"));
    return;
  }

  countrySelect.innerHTML = option("", t("countries.loading"));
  try {
    const countries = await api(`/api/countries?region=${encodeURIComponent(regionSelect.value)}`);
    if (request !== regionRequest) return;
    countries.sort((a, b) => collator.compare(a.name, b.name));
    countrySelect.innerHTML = option("", t("countries.pick_country"))
      + countries.map((c) => option(c.code, `${c.flag ?? ""} ${c.name}`.trim())).join("");
    countrySelect.disabled = countries.length === 0;
    count.textContent = tn("countries.count", countries.length, { count: countries.length });
  } catch (error) {
    if (request !== regionRequest) return;
    countrySelect.innerHTML = option("", t("countries.pick_region_first"));
    notify(error.message, "error");
  }
}

// --- País → tabla de idiomas -----------------------------------------------------

function renderCountry(country) {
  const rows = country.languages.map((language) => `
    <tr>
      <td>${escapeHtml(languageName(language))}</td>
      <td lang="${escapeHtml(language.code ?? "")}">${escapeHtml(language.native_name || "—")}</td>
    </tr>`).join("");

  result.innerHTML = `
    <div class="country-head">
      <span class="country-flag" aria-hidden="true">${escapeHtml(country.flag ?? "")}</span>
      <div>
        <p class="title">${escapeHtml(country.name)}</p>
        <p class="meta">${t("countries.native_name", { name: escapeHtml(country.native_name || "—") })}</p>
      </div>
    </div>
    ${rows ? `
      <div class="table-wrap">
        <table class="languages-table">
          <caption class="visually-hidden">${t("countries.table_caption", { name: escapeHtml(country.name) })}</caption>
          <thead>
            <tr>
              <th scope="col">${t("countries.table_language")}</th>
              <th scope="col">${t("countries.table_native")}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : `<p class="empty">${t("countries.no_languages")}</p>`}`;
}

async function loadCountry() {
  const request = ++countryRequest;
  if (!countrySelect.value) {
    showEmpty("countries.empty");
    return;
  }
  result.setAttribute("aria-busy", "true");
  try {
    const country = await api(`/api/countries/${encodeURIComponent(countrySelect.value)}`);
    if (request === countryRequest) renderCountry(country);
  } catch (error) {
    if (request === countryRequest) {
      showEmpty("countries.empty");
      notify(error.message, "error");
    }
  } finally {
    if (request === countryRequest) result.removeAttribute("aria-busy");
  }
}

await start();
regionSelect.addEventListener("change", loadCountries);
countrySelect.addEventListener("change", loadCountry);
// Hasta aquí la región está desactivada: elegirla antes de tener las
// traducciones y los eventos no haría nada.
regionSelect.disabled = false;
