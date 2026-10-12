"""Reglas de negocio de los préstamos.

Aquí vive la regla central de la biblioteca: un libro solo se puede prestar
si está disponible, y solo a un lector con el carnet vigente que no tenga ya
otro libro (`lending_rules`).
"""

from datetime import date

from business import activity_service
from business.book_service import require_book
from business.exceptions import BusinessError, NotFoundError
from business.lending_rules import (
    ensure_can_borrow,
    require_reader,
    with_due_info,
    with_reader_status,
)
from data_access.unit_of_work import UnitOfWork, unit_of_work
from entities.book import Book
from entities.loan import Loan
from entities.user import User


def _require_available_book(uow: UnitOfWork, book_id: int) -> Book:
    """El libro que se va a prestar. Regla central: no se presta dos veces."""
    book = require_book(uow, book_id)
    if not book.available:
        active_loan = uow.loans.get_active_by_book(book_id)
        raise BusinessError(
            "error.book_already_lent",
            title=book.title,
            borrower=active_loan.borrower if active_loan else "?",
        )
    return book


def _require_active_loan(uow: UnitOfWork, loan_id: int) -> Loan:
    """El préstamo que se va a cerrar. Regla: no se devuelve dos veces."""
    loan = uow.loans.get_by_id(loan_id)
    if loan is None:
        raise NotFoundError("error.loan_not_found", id=loan_id)
    if not loan.is_active:
        raise BusinessError(
            "error.loan_already_returned", title=loan.book_title, date=loan.return_date
        )
    return loan


def _loan_for(reader: User, book: Book, today: str) -> Loan:
    """El préstamo de hoy, con los datos del lector copiados de su cuenta.

    Se copian (y no solo se enlazan) para que el préstamo conserve con quién
    se hizo aunque el lector cambie después su celular o su correo.
    """
    return Loan(
        id=None,
        book_id=book.id or 0,
        reader_id=reader.id,
        borrower=reader.display_name,
        borrower_dni=reader.dni,
        borrower_email=reader.email,
        borrower_phone=reader.phone,
        loan_date=today,
        book_title=book.title,
        book_isbn=book.isbn,
        reader_card=reader.card_number,
    )


class LoanService:
    """Presta y recibe libros, manteniendo coherente el estado del catálogo."""

    def list_loans(self) -> list[Loan]:
        """Lista los préstamos con su vencimiento y su posible multa."""
        with unit_of_work() as uow:
            loans = uow.loans.get_all()
        today = date.today().isoformat()
        return [with_due_info(loan, today) for loan in loans]

    def lend_book(self, book_id: int, reader_id: int) -> Loan:
        """Presta un libro a un lector y lo marca como no disponible."""
        today = date.today().isoformat()

        # Comprobar al lector, crear el préstamo y marcar el libro son UNA
        # operación: o todo o nada, para que nunca haya un préstamo de un libro
        # «disponible» ni dos préstamos a la vez para el mismo lector.
        with unit_of_work() as uow:
            reader = with_reader_status(uow, require_reader(uow, reader_id), today)
            ensure_can_borrow(reader)
            book = _require_available_book(uow, book_id)
            created = uow.loans.create(_loan_for(reader, book, today))
            uow.books.set_available(book_id, False)

        activity_service.record(activity_service.LOANS)  # STATEFUL
        return with_due_info(created, today)

    def return_book(self, loan_id: int) -> Loan:
        """Cierra un préstamo activo y devuelve el libro al catálogo."""
        today = date.today().isoformat()

        with unit_of_work() as uow:
            loan = _require_active_loan(uow, loan_id)
            uow.loans.set_return_date(loan_id, today)
            uow.books.set_available(loan.book_id, True)
        loan.return_date = today

        activity_service.record(activity_service.RETURNS)  # STATEFUL
        return with_due_info(loan, today)
