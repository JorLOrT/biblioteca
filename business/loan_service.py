"""Reglas de negocio de los préstamos.

Aquí vive la regla central de la biblioteca: un libro solo se puede prestar
si está disponible.
"""

from datetime import date

from business import activity_service
from business.book_service import require_book
from business.exceptions import BusinessError, NotFoundError
from business.library_calculator import calculate_due_date, calculate_fine
from business.validators import validate_field
from data_access.unit_of_work import UnitOfWork, unit_of_work
from entities.book import Book
from entities.loan import Loan


def _with_due_info(loan: Loan, today: str) -> Loan:
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


def _validated_loan(
    book_id: int, borrower: str, dni: str, email: str, phone: str
) -> Loan:
    """Comprueba los datos del prestatario y prepara el préstamo de hoy.

    Los cuatro datos se comprueban con las expresiones regulares de
    `validators`, en el servidor: el navegador puede saltarse su propia
    validación, esta no.
    """
    return Loan(
        id=None,
        book_id=book_id,
        borrower=validate_field("borrower", borrower),
        borrower_dni=validate_field("dni", dni),
        borrower_email=validate_field("email", email),
        borrower_phone=validate_field("phone", phone),
        loan_date=date.today().isoformat(),
    )


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


class LoanService:
    """Presta y recibe libros, manteniendo coherente el estado del catálogo."""

    def list_loans(self) -> list[Loan]:
        """Lista los préstamos con su vencimiento y su posible multa."""
        with unit_of_work() as uow:
            loans = uow.loans.get_all()
        today = date.today().isoformat()
        return [_with_due_info(loan, today) for loan in loans]

    def lend_book(
        self, book_id: int, borrower: str, dni: str, email: str, phone: str
    ) -> Loan:
        """Registra el préstamo de un libro y lo marca como no disponible."""
        loan = _validated_loan(book_id, borrower, dni, email, phone)

        # Crear el préstamo y marcar el libro son UNA operación: o las dos o
        # ninguna, para que nunca haya un préstamo de un libro «disponible».
        with unit_of_work() as uow:
            book = _require_available_book(uow, book_id)
            loan.book_title, loan.book_isbn = book.title, book.isbn
            created = uow.loans.create(loan)
            uow.books.set_available(book_id, False)

        activity_service.record(activity_service.LOANS)  # STATEFUL
        return _with_due_info(created, loan.loan_date)

    def return_book(self, loan_id: int) -> Loan:
        """Cierra un préstamo activo y devuelve el libro al catálogo."""
        today = date.today().isoformat()

        with unit_of_work() as uow:
            loan = _require_active_loan(uow, loan_id)
            uow.loans.set_return_date(loan_id, today)
            uow.books.set_available(loan.book_id, True)
        loan.return_date = today

        activity_service.record(activity_service.RETURNS)  # STATEFUL
        return _with_due_info(loan, today)
