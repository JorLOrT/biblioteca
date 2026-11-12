"""Traducción de los errores del dominio a respuestas HTTP.

Es lo único del proyecto que conoce a la vez los errores de negocio, el idioma
del usuario y los códigos de estado HTTP. La respuesta incluye:
  - `error`: el mensaje ya traducido, listo para mostrar.
  - `code` : la clave original, por si el cliente quiere reaccionar al tipo de
             error sin depender del texto.

El chat envía sus errores con este mismo formato (`error_payload`).
"""

from typing import Callable, Optional, TypedDict

from flask import Flask, Response, jsonify

from business.exceptions import (
    AuthError,
    BusinessError,
    ForbiddenError,
    NotFoundError,
    ServiceUnavailableError,
)
from presentation.i18n import translate

# Lo que anuncia un 401 en la cabecera WWW-Authenticate (RFC 6750).
REALM = "biblioteca"
INVALID_TOKEN_KEYS = ("error.token_invalid", "error.token_expired")

# El código HTTP de cada error de negocio. Flask elige el manejador de la clase
# más concreta, así que estos ganan al de BusinessError, que va al final.
_STATUS: tuple[tuple[type[BusinessError], int], ...] = (
    (ForbiddenError, 403),
    (NotFoundError, 404),
    (ServiceUnavailableError, 503),
    (BusinessError, 400),
)


class ErrorPayload(TypedDict):
    error: str
    code: str


def error_payload(error: BusinessError, lang: Optional[str] = None) -> ErrorPayload:
    return {"error": translate(error.key, lang=lang, **error.params), "code": error.key}


def _handle_auth_error(error: AuthError) -> tuple[Response, int]:
    """401. La cabecera dice qué esquema acepta el servidor y, si llegó un
    token pero no sirve, que el problema es el token."""
    response = jsonify(error_payload(error))
    challenge = f'Bearer realm="{REALM}"'
    if error.key in INVALID_TOKEN_KEYS:
        challenge += ', error="invalid_token"'
    response.headers["WWW-Authenticate"] = challenge
    return response, 401


_Handler = Callable[[BusinessError], tuple[Response, int]]


def _handler_with_status(status: int) -> _Handler:
    def handle(error: BusinessError) -> tuple[Response, int]:
        return jsonify(error_payload(error)), status

    return handle


def register_error_handlers(app: Flask) -> None:
    app.register_error_handler(AuthError, _handle_auth_error)
    for error_class, status in _STATUS:
        app.register_error_handler(error_class, _handler_with_status(status))
