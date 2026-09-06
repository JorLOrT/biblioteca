"""Capa de Presentación: la cara visible de la aplicación.

Traduce peticiones HTTP a llamadas de la capa de Negocio y respuestas del
negocio a JSON o HTML. Nunca habla directamente con la base de datos: no
importa `sqlite3` ni ningún repositorio.

Es también la única capa que conoce la sesión del usuario: la lee, se la pasa
al negocio y guarda de vuelta el resultado.
"""

from presentation.activity_controller import activity_bp
from presentation.book_controller import book_bp
from presentation.error_handlers import register_error_handlers
from presentation.home_controller import home_bp
from presentation.loan_controller import loan_bp
from presentation.tools_controller import tools_bp
from presentation.wishlist_controller import wishlist_bp

__all__ = [
    "home_bp",
    "book_bp",
    "loan_bp",
    "tools_bp",
    "activity_bp",
    "wishlist_bp",
    "register_error_handlers",
]
