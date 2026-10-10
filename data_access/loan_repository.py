"""Repositorio de préstamos: todo el SQL de la tabla `loans`."""

import sqlite3
from typing import Optional

from entities.loan import Loan

# El JOIN trae el título del libro para poder mostrarlo sin una segunda consulta.
SELECT_LOAN = """
SELECT loans.*, books.title AS book_title
FROM loans
JOIN books ON books.id = loans.book_id
"""


class LoanRepository:
    """Operaciones sobre la tabla `loans`, dentro de la transacción recibida."""

    def __init__(self, connection: sqlite3.Connection) -> None:
        self._db = connection

    @staticmethod
    def _to_entity(row: sqlite3.Row) -> Loan:
        """Convierte una fila de SQLite en una entidad Loan."""
        return Loan(
            id=row["id"],
            book_id=row["book_id"],
            borrower=row["borrower"],
            loan_date=row["loan_date"],
            borrower_dni=row["borrower_dni"],
            borrower_email=row["borrower_email"],
            borrower_phone=row["borrower_phone"],
            return_date=row["return_date"],
            book_title=row["book_title"],
        )

    def _get_one(self, condition: str, params: tuple[int]) -> Optional[Loan]:
        row = self._db.execute(SELECT_LOAN + condition, params).fetchone()
        return self._to_entity(row) if row else None

    def get_all(self) -> list[Loan]:
        """Todos los préstamos: primero los activos, luego el historial."""
        rows = self._db.execute(
            SELECT_LOAN + " ORDER BY loans.return_date IS NOT NULL, loans.id DESC"
        ).fetchall()
        return [self._to_entity(row) for row in rows]

    def get_by_id(self, loan_id: int) -> Optional[Loan]:
        return self._get_one(" WHERE loans.id = ?", (loan_id,))

    def get_active_by_book(self, book_id: int) -> Optional[Loan]:
        """El préstamo activo de un libro, si lo tiene."""
        return self._get_one(
            " WHERE loans.book_id = ? AND loans.return_date IS NULL", (book_id,)
        )

    def create(self, loan: Loan) -> Loan:
        cursor = self._db.execute(
            "INSERT INTO loans (book_id, borrower, borrower_dni, borrower_email, "
            "borrower_phone, loan_date, return_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (loan.book_id, loan.borrower, loan.borrower_dni, loan.borrower_email,
             loan.borrower_phone, loan.loan_date, loan.return_date),
        )
        loan.id = cursor.lastrowid
        return loan

    def set_return_date(self, loan_id: int, return_date: str) -> None:
        self._db.execute(
            "UPDATE loans SET return_date = ? WHERE id = ?", (return_date, loan_id)
        )

    def delete_by_book(self, book_id: int) -> None:
        """Borra el historial de préstamos de un libro."""
        self._db.execute("DELETE FROM loans WHERE book_id = ?", (book_id,))
