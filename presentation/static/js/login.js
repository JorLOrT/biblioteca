// Inicio de sesión. Si el usuario y la contraseña son correctos, el servidor
// guarda la cuenta en la sesión y la página de inicio muestra la vista de su
// papel: el mostrador del bibliotecario o el catálogo del lector.

import { sendJson, start, t } from "./core.js";

const form = document.getElementById("login-form");
const username = document.getElementById("login-username");
const password = document.getElementById("login-password");
const errorLine = document.getElementById("login-error");

function showError(text) {
  errorLine.textContent = text;
  errorLine.hidden = false;
}

async function logIn() {
  errorLine.hidden = true;
  if (!username.value.trim() || !password.value) {
    showError(t("login.missing"));
    (username.value.trim() ? password : username).focus();
    return;
  }
  try {
    await sendJson("POST", "/api/auth/login", {
      username: username.value,
      password: password.value,
    });
    location.href = "/";
  } catch (error) {
    // El servidor da el mismo mensaje para un usuario que no existe y para
    // una contraseña equivocada.
    showError(error.message);
    password.select();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  logIn();
});

// Las cuentas de prueba entran con un clic.
document.querySelectorAll(".demo-account").forEach((button) => {
  button.addEventListener("click", () => {
    username.value = button.dataset.username;
    password.value = button.dataset.password;
    logIn();
  });
});

await start();
username.focus();
