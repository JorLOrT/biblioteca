"""Conexión a SQLite, creación del esquema y datos de ejemplo."""

import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator

# La base de datos es un único archivo en la raíz del proyecto.
# `LIBRARY_DB` permite apuntar a otro archivo (pruebas, capturas, demos) sin
# tocar la base de datos real.
DB_PATH = os.environ.get(
    "LIBRARY_DB",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "library.db"),
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS books (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT    NOT NULL,
    author    TEXT    NOT NULL,
    year      INTEGER,
    isbn      TEXT,
    available INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS loans (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id        INTEGER NOT NULL REFERENCES books(id),
    borrower       TEXT    NOT NULL,
    borrower_dni   TEXT,
    borrower_email TEXT,
    borrower_phone TEXT,
    loan_date      TEXT    NOT NULL,
    return_date    TEXT
);
"""

SEED_BOOKS = [
    ("Cien años de soledad", "Gabriel García Márquez", 1967, "9780307474728"),
    ("Don Quijote de la Mancha", "Miguel de Cervantes", 1605, "9788424922580"),
    ("La ciudad y los perros", "Mario Vargas Llosa", 1963, "9788420471839"),
    ("Rayuela", "Julio Cortázar", 1963, "9788437604572"),
    ("Ficciones", "Jorge Luis Borges", 1944, "9788499089515"),
    ("El túnel", "Ernesto Sabato", 1948, "9788432248160"),
]

# Columnas añadidas después de la primera versión. `CREATE TABLE IF NOT EXISTS`
# no toca una tabla que ya existe, así que hay que agregarlas a mano para no
# perder los datos de una base de datos anterior.
MIGRATIONS = [
    ("books", "isbn", "TEXT"),
    ("loans", "borrower_dni", "TEXT"),
    ("loans", "borrower_email", "TEXT"),
    ("loans", "borrower_phone", "TEXT"),
]


def _apply_migrations(connection) -> None:
    for tabla, columna, tipo in MIGRATIONS:
        existentes = {
            fila["name"]
            for fila in connection.execute("PRAGMA table_info({})".format(tabla))
        }
        if columna not in existentes:
            connection.execute(
                "ALTER TABLE {} ADD COLUMN {} {}".format(tabla, columna, tipo)
            )


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    """Abre una conexión a SQLite, confirma los cambios y siempre la cierra.

    Las filas son accesibles por nombre de columna (``row["title"]``).
    """
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db() -> None:
    """Crea las tablas si no existen y carga los libros de ejemplo la primera vez."""
    with get_connection() as connection:
        connection.executescript(SCHEMA)
        _apply_migrations(connection)

        already_loaded = connection.execute("SELECT COUNT(*) FROM books").fetchone()[0]
        if already_loaded == 0:
            connection.executemany(
                "INSERT INTO books (title, author, year, isbn, available) "
                "VALUES (?, ?, ?, ?, 1)",
                SEED_BOOKS,
            )
