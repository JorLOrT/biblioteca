"""Endpoints de la sesión: entrar y salir."""

from flask import Blueprint, Response, jsonify

from business import auth_service
from presentation.auth import log_in, log_out
from presentation.json_input import request_json, text_field

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/login")
def login() -> Response:
    """Comprueba el usuario y la contraseña y abre la sesión. Si fallan, 401."""
    data = request_json()
    user = auth_service.authenticate(
        text_field(data, "username"), text_field(data, "password")
    )
    return jsonify(log_in(user))


@auth_bp.post("/logout")
def logout() -> Response:
    log_out()
    return jsonify({"ok": True})
