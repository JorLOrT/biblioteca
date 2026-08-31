"""Capa de Acceso a Datos: el unico lugar del proyecto donde se escribe SQL.

Solo depende de la capa de Entidades. Su trabajo es traducir filas de SQLite
a objetos Book/Loan y viceversa. No valida nada ni conoce reglas de negocio.
"""

from data_access.book_repository import BookRepository
from data_access.database import init_db
from data_access.loan_repository import LoanRepository

__all__ = ["BookRepository", "LoanRepository", "init_db"]
