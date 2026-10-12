"""Reglas de los préstamos que usan varios servicios.

  - El vencimiento y la multa de un préstamo, con las funciones STATELESS de
    `library_calculator`.
  - Si a un lector se le puede prestar un libro. Hacen falta dos cosas:
      1. que su carnet esté vigente hoy;
      2. que no tenga ya MAX_ACTIVE_LOANS libros prestados.

`LoanService` las hace cumplir al prestar; `ReaderService` las usa para decir,
antes de intentarlo, si a cada lector se le puede prestar.
"""

from business.exceptions import BusinessError, NotFoundError
from business.library_calculator import calculate_due_date, calculate_fine
from data_access.unit_of_work import UnitOfWork
from entities.loan import Loan
from entities.user import READER, User

MAX_ACTIVE_LOANS = 1  # libros que un lector puede tener a la vez


def with_due_info(loan: Loan, today: str) -> Loan:
    """Completa el préstamo con su vencimiento y su posible multa.

    Aquí se usan las dos funciones STATELESS de `library_calculator`: se les
    pasa todo lo que necesitan como argumentos y devuelven un resultado sin
    guardar nada.
    """
    loan.due_date = calculate_due_date(loan.loan_date)
    # Si ya se devolvió se compara con la fecha de devolución; si sigue
    # prestado, con la de hoy.
    penalty = calculate_fine(loan.due_date, loan.return_date or today)
    loan.days_late = penalty["days_late"]
    loan.fine = penalty["fine"]
    return loan


def require_reader(uow: UnitOfWork, reader_id: int) -> User:
    """La cuenta de un lector. Si no existe (o no es de un lector), 404."""
    reader = uow.users.get_by_id(reader_id)
    if reader is None or reader.role != READER:
        raise NotFoundError("error.reader_not_found", id=reader_id)
    return reader


def with_reader_status(uow: UnitOfWork, reader: User, today: str) -> User:
    """Completa al lector con su carnet y sus préstamos: ¿se le puede prestar?"""
    # Las fechas AAAA-MM-DD se ordenan igual como texto que como fecha.
    reader.card_valid = bool(reader.card_expires) and str(reader.card_expires) >= today
    reader.active_loans = [
        with_due_info(loan, today)
        for loan in uow.loans.get_active_by_reader(reader.id or 0)
    ]
    has_room = len(reader.active_loans) < MAX_ACTIVE_LOANS
    reader.can_borrow = reader.card_valid and has_room
    return reader


def ensure_can_borrow(reader: User) -> None:
    """Las dos reglas del lector, en el orden en que se le explican."""
    if not reader.card_valid:
        raise BusinessError(
            "error.card_expired",
            name=reader.display_name,
            date=reader.card_expires or "—",
        )
    if len(reader.active_loans) >= MAX_ACTIVE_LOANS:
        raise BusinessError(
            "error.reader_has_loan",
            name=reader.display_name,
            title=reader.active_loans[0].book_title,
        )
