"""Entidad Loan (Prestamo)."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class Loan:
    """El prestamo de un libro a una persona.

    Si `return_date` es None el prestamo sigue activo (el libro no ha vuelto).
    """

    id: Optional[int]
    book_id: int
    borrower: str
    loan_date: str
    return_date: Optional[str] = None
    book_title: Optional[str] = None  # se rellena al listar, para no consultar dos veces

    @property
    def is_active(self) -> bool:
        return self.return_date is None

    def to_dict(self) -> dict:
        """Representacion serializable a JSON."""
        return {
            "id": self.id,
            "book_id": self.book_id,
            "book_title": self.book_title,
            "borrower": self.borrower,
            "loan_date": self.loan_date,
            "return_date": self.return_date,
            "is_active": self.is_active,
        }
