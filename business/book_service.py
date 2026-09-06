"""Reglas de negocio del catálogo de libros."""

from datetime import date
from typing import List, Optional

from business import activity_service
from business.exceptions import BusinessError, NotFoundError
from data_access.book_repository import BookRepository
from data_access.loan_repository import LoanRepository
from entities.book import Book

FIRST_PRINTED_YEAR = 1450  # imprenta de Gutenberg


class BookService:
    """Valida los datos de un libro y coordina su persistencia."""

    def __init__(self) -> None:
        self._books = BookRepository()
        self._loans = LoanRepository()

    # --- Reglas de validación -------------------------------------------------

    def _validate(self, title: str, author: str, year: Optional[int]) -> int:
        """Comprueba los datos de un libro y devuelve el año ya normalizado."""
        if not title or not title.strip():
            raise BusinessError("El título es obligatorio.")
        if not author or not author.strip():
            raise BusinessError("El autor es obligatorio.")

        try:
            year_value = int(year)
        except (TypeError, ValueError):
            raise BusinessError("El año debe ser un número.")

        current_year = date.today().year
        if not FIRST_PRINTED_YEAR <= year_value <= current_year:
            raise BusinessError(
                "El año debe estar entre {} y {}.".format(
                    FIRST_PRINTED_YEAR, current_year
                )
            )
        return year_value

    # --- Casos de uso ---------------------------------------------------------

    def list_books(self, only_available: bool = False) -> List[Book]:
        return self._books.get_all(only_available=only_available)

    def get_book(self, book_id: int) -> Book:
        book = self._books.get_by_id(book_id)
        if book is None:
            raise NotFoundError("No existe un libro con id {}.".format(book_id))
        return book

    def create_book(self, title: str, author: str, year: Optional[int]) -> Book:
        year_value = self._validate(title, author, year)
        # Un libro recién registrado siempre entra disponible al catálogo.
        book = Book(
            id=None,
            title=title.strip(),
            author=author.strip(),
            year=year_value,
            available=True,
        )
        created = self._books.create(book)
        activity_service.record("libros_registrados")  # STATEFUL
        return created

    def update_book(
        self, book_id: int, title: str, author: str, year: Optional[int]
    ) -> Book:
        book = self.get_book(book_id)
        year_value = self._validate(title, author, year)

        book.title = title.strip()
        book.author = author.strip()
        book.year = year_value
        # `available` no se toca aquí: solo lo cambian los préstamos.
        return self._books.update(book)

    def delete_book(self, book_id: int) -> None:
        book = self.get_book(book_id)

        # Regla: un libro que alguien tiene prestado no se puede eliminar.
        active_loan = self._loans.get_active_by_book(book.id)
        if active_loan is not None:
            raise BusinessError(
                'No se puede eliminar "{}": lo tiene prestado {}.'.format(
                    book.title, active_loan.borrower
                )
            )

        # El historial de préstamos apunta al libro, así que se limpia primero
        # para no dejar filas huérfanas en `loans`.
        self._loans.delete_by_book(book.id)
        self._books.delete(book.id)

        activity_service.record("libros_eliminados")  # STATEFUL
