"""Traducción de los errores del dominio a respuestas HTTP.

Es lo único del proyecto que conoce a la vez los errores de negocio, el idioma
del usuario y los códigos de estado HTTP. La respuesta incluye:
  - `error`: el mensaje ya traducido, listo para mostrar.
  - `code` : la clave original, por si el cliente quiere reaccionar al tipo de
             error sin depender del texto.
"""

from flask import Flask, jsonify

from business.exceptions import BusinessError, NotFoundError
from presentation.i18n import translate


def _payload(error: BusinessError) -> dict:
    return {"error": translate(error.key, **error.params), "code": error.key}


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(NotFoundError)
    def handle_not_found(error: NotFoundError):
        return jsonify(_payload(error)), 404

    @app.errorhandler(BusinessError)
    def handle_business_error(error: BusinessError):
        return jsonify(_payload(error)), 400
