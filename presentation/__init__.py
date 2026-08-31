"""Capa de Presentación: la cara visible de la aplicación.

Traduce peticiones HTTP a llamadas de la capa de Negocio y respuestas del
negocio a JSON o HTML. Nunca habla directamente con la base de datos: no
importa `sqlite3` ni ningún repositorio.
"""

from presentation.book_controller import book_bp
from presentation.error_handlers import register_error_handlers
from presentation.home_controller import home_bp
from presentation.loan_controller import loan_bp

__all__ = ["book_bp", "loan_bp", "home_bp", "register_error_handlers"]
