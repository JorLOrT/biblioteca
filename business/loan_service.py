"""Reglas de negocio de los préstamos.

Aquí vive la regla central de la biblioteca: un libro solo se puede prestar
si está disponible.
"""

from datetime import date
from typing import List

from business import activity_service
from business.exceptions import BusinessError, NotFoundError
from business.library_calculator import calculate_due_date, calculate_fine
from data_access.book_repository import BookRepository
from data_access.loan_repository import LoanRepository
from entities.loan import Loan


class LoanService:
    """Presta y recibe libros, manteniendo coherente el estado del catálogo."""

    def __init__(self) -> None:
        self._books = BookRepository()
        self._loans = LoanRepository()

    def list_loans(self) -> List[Loan]:
        """Lista los préstamos calculando su vencimiento y su posible multa.

        Aquí se usan las dos funciones STATELESS de `library_calculator`: se les
        pasa todo lo que necesitan como argumentos y devuelven un resultado sin
        guardar nada.
        """
        loans = self._loans.get_all()
        today = date.today().isoformat()

        for loan in loans:
            loan.due_date = calculate_due_date(loan.loan_date)
            # Si ya se devolvió se compara con la fecha de devolución; si sigue
            # prestado, con la de hoy.
            reference = loan.return_date or today
            penalty = calculate_fine(loan.due_date, reference)
            loan.days_late = penalty["days_late"]
            loan.fine = penalty["fine"]

        return loans

    def lend_book(self, book_id: int, borrower: str) -> Loan:
        """Registra el préstamo de un libro y lo marca como no disponible."""
        if not borrower or not borrower.strip():
            raise BusinessError("El nombre de quien se lleva el libro es obligatorio.")

        try:
            book_id = int(book_id)
        except (TypeError, ValueError):
            raise BusinessError("Debe indicar qué libro se va a prestar.")

        book = self._books.get_by_id(book_id)
        if book is None:
            raise NotFoundError("No existe un libro con id {}.".format(book_id))

        # Regla central: no se presta dos veces el mismo ejemplar.
        if not book.available:
            active_loan = self._loans.get_active_by_book(book.id)
            holder = active_loan.borrower if active_loan else "otra persona"
            raise BusinessError(
                'El libro "{}" ya está prestado a {}.'.format(book.title, holder)
            )

        loan = self._loans.create(
            Loan(
                id=None,
                book_id=book.id,
                borrower=borrower.strip(),
                loan_date=date.today().isoformat(),
                return_date=None,
                book_title=book.title,
            )
        )

        book.available = False
        self._books.update(book)

        activity_service.record("prestamos")  # STATEFUL: el servidor lo recuerda

        return loan

    def return_book(self, loan_id: int) -> Loan:
        """Cierra un préstamo activo y devuelve el libro al catálogo."""
        loan = self._loans.get_by_id(loan_id)
        if loan is None:
            raise NotFoundError("No existe un préstamo con id {}.".format(loan_id))

        # Regla: un préstamo ya cerrado no se puede devolver otra vez.
        if not loan.is_active:
            raise BusinessError(
                'El préstamo de "{}" ya fue devuelto el {}.'.format(
                    loan.book_title, loan.return_date
                )
            )

        self._loans.set_return_date(loan.id, date.today().isoformat())

        book = self._books.get_by_id(loan.book_id)
        if book is not None:
            book.available = True
            self._books.update(book)

        activity_service.record("devoluciones")  # STATEFUL

        return self._loans.get_by_id(loan.id)
