"""Repositorio de préstamos: todo el SQL de la tabla `loans`."""

import sqlite3
from typing import List, Optional

from data_access.database import get_connection
from entities.loan import Loan

# El JOIN trae el título del libro para poder mostrarlo sin una segunda consulta.
SELECT_LOAN = """
SELECT loans.*, books.title AS book_title
FROM loans
JOIN books ON books.id = loans.book_id
"""


class LoanRepository:
    """Operaciones sobre la tabla `loans`."""

    @staticmethod
    def _to_entity(row: sqlite3.Row) -> Loan:
        """Convierte una fila de SQLite en una entidad Loan."""
        return Loan(
            id=row["id"],
            book_id=row["book_id"],
            borrower=row["borrower"],
            loan_date=row["loan_date"],
            return_date=row["return_date"],
            book_title=row["book_title"],
        )

    def get_all(self) -> List[Loan]:
        """Todos los préstamos: primero los activos, luego el historial."""
        with get_connection() as connection:
            rows = connection.execute(
                SELECT_LOAN + " ORDER BY loans.return_date IS NOT NULL, loans.id DESC"
            ).fetchall()
        return [self._to_entity(row) for row in rows]

    def get_by_id(self, loan_id: int) -> Optional[Loan]:
        with get_connection() as connection:
            row = connection.execute(
                SELECT_LOAN + " WHERE loans.id = ?", (loan_id,)
            ).fetchone()
        return self._to_entity(row) if row else None

    def get_active_by_book(self, book_id: int) -> Optional[Loan]:
        """El préstamo activo de un libro, si lo tiene."""
        with get_connection() as connection:
            row = connection.execute(
                SELECT_LOAN + " WHERE loans.book_id = ? AND loans.return_date IS NULL",
                (book_id,),
            ).fetchone()
        return self._to_entity(row) if row else None

    def create(self, loan: Loan) -> Loan:
        with get_connection() as connection:
            cursor = connection.execute(
                "INSERT INTO loans (book_id, borrower, loan_date, return_date) VALUES (?, ?, ?, ?)",
                (loan.book_id, loan.borrower, loan.loan_date, loan.return_date),
            )
            loan.id = cursor.lastrowid
        return loan

    def set_return_date(self, loan_id: int, return_date: str) -> None:
        with get_connection() as connection:
            connection.execute(
                "UPDATE loans SET return_date = ? WHERE id = ?", (return_date, loan_id)
            )

    def delete_by_book(self, book_id: int) -> None:
        """Borra el historial de préstamos de un libro."""
        with get_connection() as connection:
            connection.execute("DELETE FROM loans WHERE book_id = ?", (book_id,))
