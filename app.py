"""Punto de entrada de la aplicación.

Aquí se ensamblan las capas: se prepara la base de datos (capa de Acceso a
Datos) y se registran los controladores (capa de Presentación). El flujo de
una petición siempre baja en el mismo orden:

    Navegador -> Presentación -> Negocio -> Acceso a Datos -> SQLite

La configuración llega por variables de entorno, nunca escrita en el código:
  SECRET_KEY             obligatoria: firma la cookie de sesión.
  HOST, PORT             dónde escucha el servidor (127.0.0.1:5001 por defecto).
  FLASK_DEBUG            con "1" activa el modo de depuración. Nunca en producción.
  LIBRARY_DB             otra base de datos (la lee `data_access.database`).
  SESSION_COOKIE_SECURE  con "1", la cookie de sesión solo viaja por HTTPS.

En producción (Docker) no se usa `python app.py`: Gunicorn llama a
`create_app()` con la configuración de `gunicorn.conf.py`.
"""

import os

from flask import Flask
from flask.json.provider import DefaultJSONProvider

from business.auth_service import ensure_demo_accounts
from data_access.database import init_db
from presentation.activity_controller import activity_bp
from presentation.auth_controller import auth_bp
from presentation.book_controller import book_bp
from presentation.chat_socket import sock
from presentation.error_handlers import register_error_handlers
from presentation.home_controller import home_bp
from presentation.i18n_controller import i18n_bp
from presentation.loan_controller import loan_bp
from presentation.reader_controller import reader_bp
from presentation.tools_controller import tools_bp
from presentation.validation_controller import validation_bp
from presentation.wishlist_controller import wishlist_bp

# Por defecto solo se escucha en esta máquina. El Dockerfile pone 0.0.0.0,
# porque dentro del contenedor el puerto lo publica Docker.
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "5001"))  # el 5000 lo ocupa AirPlay en macOS
# El depurador de Flask permite ejecutar código desde el navegador: solo se
# activa si se pide expresamente.
DEBUG = os.environ.get("FLASK_DEBUG") == "1"


class UnicodeJSONProvider(DefaultJSONProvider):
    """JSON con las tildes y la ñ legibles, en lugar de escaparlas como \\u00f1."""

    ensure_ascii = False


def _secret_key() -> str:
    """La clave que firma la cookie de sesión. Sin ella, la aplicación no arranca.

    Una clave por defecto escrita aquí la conocería cualquiera que lea el
    repositorio, y con ella podría fabricar la sesión de otro usuario.
    """
    key = os.environ.get("SECRET_KEY")
    if not key:
        raise RuntimeError(
            "Falta la variable de entorno SECRET_KEY. Se puede generar con:\n"
            "  python3 -c 'import secrets; print(secrets.token_hex(32))'"
        )
    return key


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder="presentation/templates",
        static_folder="presentation/static",
    )
    app.json = UnicodeJSONProvider(app)
    # Firma la cookie de sesión (cuenta, idioma y lista de deseos).
    app.secret_key = _secret_key()
    # Lax: el navegador no manda la cookie en peticiones que lancen otras webs,
    # así que otra página no puede prestar ni borrar nada en nombre de quien
    # tenga la sesión abierta.
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    # Detrás de HTTPS (un dominio en Dokploy), la cookie solo viaja cifrada.
    # Se activa a mano: con HTTP sin cifrar, una cookie «Secure» no llega y no
    # se podría iniciar sesión.
    app.config["SESSION_COOKIE_SECURE"] = os.environ.get("SESSION_COOKIE_SECURE") == "1"

    init_db()
    ensure_demo_accounts()

    app.register_blueprint(home_bp)
    app.register_blueprint(auth_bp)        # iniciar y cerrar sesión
    app.register_blueprint(book_bp)
    app.register_blueprint(loan_bp)
    app.register_blueprint(reader_bp)      # cuentas y carnets de los lectores
    app.register_blueprint(i18n_bp)        # idioma (i18n)
    app.register_blueprint(validation_bp)  # patrones regex para el navegador
    app.register_blueprint(tools_bp)       # endpoints STATELESS
    app.register_blueprint(activity_bp)    # endpoints STATEFUL (memoria)
    app.register_blueprint(wishlist_bp)    # endpoints STATEFUL (sesión)
    register_error_handlers(app)

    # WebSocket del chat: mantiene la conexión abierta en los dos sentidos.
    sock.init_app(app)

    return app


if __name__ == "__main__":
    application = create_app()
    print(f"Biblioteca N-Capas -> http://{HOST}:{PORT}")
    application.run(host=HOST, port=PORT, debug=DEBUG)
