"""Traducción de los errores del dominio a respuestas HTTP.

Es lo único del proyecto que conoce a la vez los errores de negocio y los
códigos de estado HTTP. Gracias a esto los controladores quedan limpios.
"""

from flask import Flask, jsonify

from business.exceptions import BusinessError, NotFoundError


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(NotFoundError)
    def handle_not_found(error: NotFoundError):
        return jsonify({"error": str(error)}), 404

    @app.errorhandler(BusinessError)
    def handle_business_error(error: BusinessError):
        return jsonify({"error": str(error)}), 400
