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

from business.exceptions import BusinessError, NotFoundError
from presentation.i18n import translate


class ErrorPayload(TypedDict):
    error: str
    code: str


def error_payload(error: BusinessError, lang: Optional[str] = None) -> ErrorPayload:
    return {"error": translate(error.key, lang=lang, **error.params), "code": error.key}


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(NotFoundError)
    def handle_not_found(error: NotFoundError) -> tuple[Response, int]:
        return jsonify(error_payload(error)), 404

    @app.errorhandler(BusinessError)
    def handle_business_error(error: BusinessError) -> tuple[Response, int]:
        return jsonify(error_payload(error)), 400
