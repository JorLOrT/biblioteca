"""Reglas de negocio del catálogo de libros."""

from datetime import date
from typing import List, Optional

from business import activity_service
from business.exceptions import BusinessError, NotFoundError
from business.validators import normalize_isbn, validate_field
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

    def _validate(self, title: str, author: str, year, isbn: str) -> dict:
        """Comprueba el formulario de un libro y devuelve sus datos ya limpios.

        El FORMATO lo comprueban las expresiones regulares de `validators`; el
        SIGNIFICADO (que el año sea posible) se comprueba aquí, porque un regex
        puede decir que «3000» son cuatro cifras, pero no que sea un año válido.
        """
        datos = {
            "title": validate_field("title", title),
            "author": validate_field("author", author),
            "isbn": normalize_isbn(validate_field("isbn", isbn)),
        }

        year_value = int(validate_field("year", year))
        current_year = date.today().year
        if not FIRST_PRINTED_YEAR <= year_value <= current_year:
            raise BusinessError(
                "error.year_out_of_range", min=FIRST_PRINTED_YEAR, max=current_year
            )
        datos["year"] = year_value
        return datos

    # --- Casos de uso ---------------------------------------------------------

    def list_books(self, only_available: bool = False) -> List[Book]:
        return self._books.get_all(only_available=only_available)

    def get_book(self, book_id: int) -> Book:
        book = self._books.get_by_id(book_id)
        if book is None:
            raise NotFoundError("error.book_not_found", id=book_id)
        return book

    def create_book(self, title: str, author: str, year, isbn: str = "") -> Book:
        datos = self._validate(title, author, year, isbn)
        # Un libro recién registrado siempre entra disponible al catálogo.
        book = Book(
            id=None,
            title=datos["title"],
            author=datos["author"],
            year=datos["year"],
            isbn=datos["isbn"],
            available=True,
        )
        created = self._books.create(book)
        activity_service.record("libros_registrados")  # STATEFUL
        return created

    def update_book(
        self, book_id: int, title: str, author: str, year, isbn: str = ""
    ) -> Book:
        book = self.get_book(book_id)
        datos = self._validate(title, author, year, isbn or book.isbn or "")

        book.title = datos["title"]
        book.author = datos["author"]
        book.year = datos["year"]
        book.isbn = datos["isbn"]
        # `available` no se toca aquí: solo lo cambian los préstamos.
        return self._books.update(book)

    def delete_book(self, book_id: int) -> None:
        book = self.get_book(book_id)

        # Regla: un libro que alguien tiene prestado no se puede eliminar.
        active_loan = self._loans.get_active_by_book(book.id)
        if active_loan is not None:
            raise BusinessError(
                "error.book_has_active_loan",
                title=book.title,
                borrower=active_loan.borrower,
            )

        # El historial de préstamos apunta al libro, así que se limpia primero
        # para no dejar filas huérfanas en `loans`.
        self._loans.delete_by_book(book.id)
        self._books.delete(book.id)

        activity_service.record("libros_eliminados")  # STATEFUL
