"""Unidad de trabajo: varias operaciones de datos en UNA sola transacción.

Prestar un libro son dos escrituras: crear la fila en `loans` y marcar el libro
como no disponible. Si la segunda fallara después de hacer la primera, la base
de datos quedaría con un préstamo activo de un libro que figura disponible.

La unidad de trabajo abre una conexión, empieza una transacción y entrega los
dos repositorios trabajando sobre ella:

    with unit_of_work() as uow:
        uow.loans.create(loan)
        uow.books.set_available(book_id, False)

Al salir del bloque se confirma todo junto; si dentro se lanza cualquier
excepción, no se guarda nada. El negocio decide QUÉ operaciones van juntas y
esta capa sabe CÓMO hacerlo, así que el negocio sigue sin ver `sqlite3`.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

from data_access.book_repository import BookRepository
from data_access.database import get_connection
from data_access.loan_repository import LoanRepository


@dataclass(frozen=True)
class UnitOfWork:
    """Los repositorios de una misma transacción."""

    books: BookRepository
    loans: LoanRepository


@contextmanager
def unit_of_work() -> Iterator[UnitOfWork]:
    with get_connection() as connection:
        # IMMEDIATE reserva la escritura desde el principio. Sin él, dos
        # préstamos simultáneos podrían leer los dos «disponible» antes de que
        # ninguno escribiera, y el mismo libro se prestaría dos veces.
        connection.execute("BEGIN IMMEDIATE")
        yield UnitOfWork(BookRepository(connection), LoanRepository(connection))
