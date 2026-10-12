"""Entidad Loan (Préstamo)."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class Loan:
    """El préstamo de un libro a una persona.

    Si `return_date` es None el préstamo sigue activo (el libro no ha vuelto).
    """

    id: Optional[int]
    book_id: int
    borrower: str
    loan_date: str
    # La cuenta del lector. Los datos de abajo se copian de ella al prestar,
    # para que el préstamo conserve con quién se hizo aunque la cuenta cambie.
    # Opcionales porque las filas anteriores a las cuentas no los tienen.
    reader_id: Optional[int] = None
    borrower_dni: Optional[str] = None
    borrower_email: Optional[str] = None
    borrower_phone: Optional[str] = None
    return_date: Optional[str] = None

    # Campos calculados: no están en la tabla `loans`. El título y el ISBN los
    # trae el JOIN con `books`, y el carnet el de `users`; el vencimiento y la
    # multa, la capa de negocio.
    book_title: Optional[str] = None
    book_isbn: Optional[str] = None
    reader_card: Optional[str] = None
    due_date: Optional[str] = None
    days_late: int = 0
    fine: float = 0.0

    @property
    def is_active(self) -> bool:
        return self.return_date is None

    def to_dict(self) -> dict[str, object]:
        """Representación serializable a JSON."""
        return {
            "id": self.id,
            "book_id": self.book_id,
            "book_title": self.book_title,
            "book_isbn": self.book_isbn,
            "reader_id": self.reader_id,
            "reader_card": self.reader_card,
            "borrower": self.borrower,
            "borrower_dni": self.borrower_dni,
            "borrower_email": self.borrower_email,
            "borrower_phone": self.borrower_phone,
            "loan_date": self.loan_date,
            "return_date": self.return_date,
            "is_active": self.is_active,
            "due_date": self.due_date,
            "days_late": self.days_late,
            "fine": self.fine,
        }
