"""Repositorio de libros: todo el SQL de la tabla `books`."""

import sqlite3
from typing import Optional

from entities.book import Book


class BookRepository:
    """Operaciones CRUD sobre la tabla `books`.

    No valida datos ni aplica reglas: eso es trabajo de la capa de negocio.
    Trabaja sobre la conexión que le da la unidad de trabajo, así que no abre
    ni confirma transacciones por su cuenta.
    """

    def __init__(self, connection: sqlite3.Connection) -> None:
        self._db = connection

    @staticmethod
    def _to_entity(row: sqlite3.Row) -> Book:
        """Convierte una fila de SQLite en una entidad Book."""
        return Book(
            id=row["id"],
            title=row["title"],
            author=row["author"],
            year=row["year"],
            isbn=row["isbn"],
            available=bool(row["available"]),
        )

    def get_all(self, only_available: bool = False) -> list[Book]:
        query = "SELECT * FROM books"
        if only_available:
            query += " WHERE available = 1"
        rows = self._db.execute(query + " ORDER BY title").fetchall()
        return [self._to_entity(row) for row in rows]

    def get_by_id(self, book_id: int) -> Optional[Book]:
        row = self._db.execute(
            "SELECT * FROM books WHERE id = ?", (book_id,)
        ).fetchone()
        return self._to_entity(row) if row else None

    def create(self, book: Book) -> Book:
        cursor = self._db.execute(
            "INSERT INTO books (title, author, year, isbn, available) "
            "VALUES (?, ?, ?, ?, ?)",
            (book.title, book.author, book.year, book.isbn, int(book.available)),
        )
        book.id = cursor.lastrowid
        return book

    def update(self, book: Book) -> Book:
        self._db.execute(
            "UPDATE books SET title = ?, author = ?, year = ?, isbn = ?, "
            "available = ? WHERE id = ?",
            (book.title, book.author, book.year, book.isbn,
             int(book.available), book.id),
        )
        return book

    def set_available(self, book_id: int, available: bool) -> None:
        self._db.execute(
            "UPDATE books SET available = ? WHERE id = ?", (int(available), book_id)
        )

    def delete(self, book_id: int) -> None:
        self._db.execute("DELETE FROM books WHERE id = ?", (book_id,))
