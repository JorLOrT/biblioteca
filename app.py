"""Punto de entrada de la aplicación.

Aquí se ensamblan las capas: se prepara la base de datos (capa de Acceso a
Datos) y se registran los controladores (capa de Presentación). El flujo de
una petición siempre baja en el mismo orden:

    Navegador -> Presentación -> Negocio -> Acceso a Datos -> SQLite
"""

import os

from flask import Flask

from data_access.database import init_db
from presentation import (
    activity_bp,
    book_bp,
    home_bp,
    loan_bp,
    register_error_handlers,
    tools_bp,
    wishlist_bp,
)

PORT = 5001  # el 5000 lo ocupa AirPlay Receiver en macOS


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder="presentation/templates",
        static_folder="presentation/static",
    )
    # Para que los mensajes con tildes y ñ viajen legibles en el JSON.
    app.json.ensure_ascii = False

    # Necesaria para firmar la cookie de sesión (la lista de deseos).
    # En producción debe venir del entorno, nunca escrita en el código.
    app.secret_key = os.environ.get("SECRET_KEY", "clave-de-desarrollo-biblioteca")

    init_db()

    app.register_blueprint(home_bp)
    app.register_blueprint(book_bp)
    app.register_blueprint(loan_bp)
    app.register_blueprint(tools_bp)      # endpoints STATELESS
    app.register_blueprint(activity_bp)   # endpoints STATEFUL (memoria)
    app.register_blueprint(wishlist_bp)   # endpoints STATEFUL (sesión)
    register_error_handlers(app)

    return app


app = create_app()


if __name__ == "__main__":
    print("Biblioteca N-Capas -> http://127.0.0.1:{}".format(PORT))
    app.run(host="0.0.0.0", port=PORT, debug=True)
