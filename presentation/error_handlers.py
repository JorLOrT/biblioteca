"""Traducción de los errores del dominio a respuestas HTTP.

Es lo único del proyecto que conoce a la vez los errores de negocio, el idioma
del usuario y los códigos de estado HTTP. La respuesta incluye:
  - `error`: el mensaje ya traducido, listo para mostrar.
  - `code` : la clave original, por si el cliente quiere reaccionar al tipo de
             error sin depender del texto.

El chat envía sus errores con este mismo formato (`error_payload`).
"""

from typing import Optional, TypedDict

from flask import Flask, Response, jsonify

from business.exceptions import AuthError, BusinessError, ForbiddenError, NotFoundError
from presentation.i18n import translate


class ErrorPayload(TypedDict):
    error: str
    code: str


def error_payload(error: BusinessError, lang: Optional[str] = None) -> ErrorPayload:
    return {"error": translate(error.key, lang=lang, **error.params), "code": error.key}


def register_error_handlers(app: Flask) -> None:
    # Flask elige el manejador de la clase más concreta, así que estos tres
    # ganan al de BusinessError.
    @app.errorhandler(AuthError)
    def handle_auth_error(error: AuthError) -> tuple[Response, int]:
        return jsonify(error_payload(error)), 401

    @app.errorhandler(ForbiddenError)
    def handle_forbidden(error: ForbiddenError) -> tuple[Response, int]:
        return jsonify(error_payload(error)), 403

    @app.errorhandler(NotFoundError)
    def handle_not_found(error: NotFoundError) -> tuple[Response, int]:
        return jsonify(error_payload(error)), 404

    @app.errorhandler(BusinessError)
    def handle_business_error(error: BusinessError) -> tuple[Response, int]:
        return jsonify(error_payload(error)), 400
