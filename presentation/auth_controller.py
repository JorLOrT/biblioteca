"""Endpoints de la autenticación.

  - `/login` comprueba el usuario y la contraseña, abre la cookie de sesión y
    entrega un JWT. La cookie sirve para las páginas y el chat, que el navegador
    pide sin cabeceras propias; el JWT, para las llamadas a la API, que el
    JavaScript envía con `Authorization: Bearer <token>`.
  - `/session/token` entrega un JWT nuevo a quien ya tiene la cookie: así el
    navegador renueva el token sin volver a pedir la contraseña.
  - `/token` es el servicio de login para clientes sin navegador: solo el JWT.
  - `/me` dice quién hace la petición y cómo se identificó.
"""

from typing import Optional

from flask import Blueprint, Response, jsonify, session

from business import auth_service
from business.exceptions import AuthError
from business.token_service import TokenClaims
from entities.user import User
from presentation.auth import (
    SESSION_KEY,
    SessionUser,
    auth_method,
    current_user,
    log_in,
    log_out,
    login_required,
    token_service,
)
from presentation.json_input import request_json, text_field

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _authenticate() -> User:
    """La cuenta del usuario y la contraseña del JSON. Si fallan, 401."""
    data = request_json()
    return auth_service.authenticate(
        text_field(data, "username"), text_field(data, "password")
    )


def _token_response(user: SessionUser) -> Response:
    """Un JWT para la cuenta, con la forma del endpoint de tokens de OAuth 2.0."""
    issued = token_service().issue(
        TokenClaims(username=user["username"], name=user["name"], role=user["role"])
    )
    response = jsonify({
        "access_token": issued.access_token,
        "token_type": "Bearer",
        "expires_in": issued.expires_in,
        "user": user,
    })
    # Una credencial no debe quedar guardada en ninguna caché.
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return response


@auth_bp.post("/login")
def login() -> Response:
    """POST /api/auth/login {username, password} — el navegador entra."""
    return _token_response(log_in(_authenticate()))


@auth_bp.post("/logout")
def logout() -> Response:
    log_out()
    return jsonify({"ok": True})


@auth_bp.post("/token")
def token() -> Response:
    """POST /api/auth/token {username, password} — el servicio de login con JWT."""
    user = _authenticate()
    return _token_response(
        SessionUser(username=user.username, name=user.display_name, role=user.role)
    )


@auth_bp.post("/session/token")
def session_token() -> Response:
    """POST /api/auth/session/token — un JWT nuevo para la sesión del navegador.

    Solo con la cookie: renovar un token con otro token alargaría sin fin la
    vida de uno robado. Otra web no puede pedirlo en nombre del usuario, porque
    la cookie es SameSite=Lax y no viaja en un POST que venga de fuera.
    """
    user: Optional[SessionUser] = session.get(SESSION_KEY)
    if user is None:
        raise AuthError("error.login_required")
    return _token_response(user)


@auth_bp.get("/me")
def me() -> Response:
    """GET /api/auth/me — la cuenta que hace la petición y cómo se identificó."""
    login_required()
    user = current_user()
    return jsonify({**(user or {}), "auth": auth_method()})
