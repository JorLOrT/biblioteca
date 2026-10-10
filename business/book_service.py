"""Reglas de negocio del catálogo de libros."""

from dataclasses import replace
from datetime import date

from business import activity_service
from business.exceptions import BusinessError, NotFoundError
from business.validators import normalize_isbn, validate_field
from data_access.unit_of_work import UnitOfWork, unit_of_work
from entities.book import Book

FIRST_PRINTED_YEAR = 1450  # imprenta de Gutenberg


def require_book(uow: UnitOfWork, book_id: int) -> Book:
    """El libro con ese id. Si no existe, la operación se detiene con un 404."""
    book = uow.books.get_by_id(book_id)
    if book is None:
        raise NotFoundError("error.book_not_found", id=book_id)
    return book


def _validated_book(title: str, author: str, year: str, isbn: str) -> Book:
    """Comprueba el formulario de un libro y lo devuelve con los datos ya limpios.

    El FORMATO lo comprueban las expresiones regulares de `validators`; el
    SIGNIFICADO (que el año sea posible) se comprueba aquí, porque un regex
    puede decir que «3000» son cuatro cifras, pero no que sea un año válido.
    """
    clean_title = validate_field("title", title)
    clean_author = validate_field("author", author)
    clean_isbn = normalize_isbn(validate_field("isbn", isbn))

    year_value = int(validate_field("year", year))
    current_year = date.today().year
    if not FIRST_PRINTED_YEAR <= year_value <= current_year:
        raise BusinessError(
            "error.year_out_of_range", min=FIRST_PRINTED_YEAR, max=current_year
        )

    return Book(
        id=None,
        title=clean_title,
        author=clean_author,
        year=year_value,
        isbn=clean_isbn,
    )


class BookService:
    """Valida los datos de un libro y coordina su persistencia."""

    def list_books(self, only_available: bool = False) -> list[Book]:
        with unit_of_work() as uow:
            return uow.books.get_all(only_available=only_available)

    def get_book(self, book_id: int) -> Book:
        with unit_of_work() as uow:
            return require_book(uow, book_id)

    def create_book(self, title: str, author: str, year: str, isbn: str) -> Book:
        # Un libro recién registrado siempre entra disponible al catálogo.
        book = _validated_book(title, author, year, isbn)
        with unit_of_work() as uow:
            created = uow.books.create(book)
        activity_service.record(activity_service.BOOKS_CREATED)  # STATEFUL
        return created

    def update_book(
        self, book_id: int, title: str, author: str, year: str, isbn: str
    ) -> Book:
        with unit_of_work() as uow:
            current = require_book(uow, book_id)
            edited = _validated_book(title, author, year, isbn or current.isbn or "")
            # `available` no se toca aquí: solo lo cambian los préstamos.
            return uow.books.update(
                replace(edited, id=current.id, available=current.available)
            )

    def delete_book(self, book_id: int) -> None:
        with unit_of_work() as uow:
            book = require_book(uow, book_id)

            # Regla: un libro que alguien tiene prestado no se puede eliminar.
            active_loan = uow.loans.get_active_by_book(book_id)
            if active_loan is not None:
                raise BusinessError(
                    "error.book_has_active_loan",
                    title=book.title,
                    borrower=active_loan.borrower,
                )

            # El historial de préstamos apunta al libro, así que se borra
            # primero. Las dos escrituras van en la misma transacción: si la
            # segunda falla, el historial no se pierde.
            uow.loans.delete_by_book(book_id)
            uow.books.delete(book_id)

        activity_service.record(activity_service.BOOKS_DELETED)  # STATEFUL
