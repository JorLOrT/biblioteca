"""Conexión a SQLite, creación del esquema y datos de ejemplo."""

import os
import sqlite3
import unicodedata
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Optional

# La base de datos es un único archivo en la raíz del proyecto.
# `LIBRARY_DB` permite apuntar a otro archivo (pruebas, capturas, demos) sin
# tocar la base de datos real.
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get("LIBRARY_DB", os.path.join(_PROJECT_ROOT, "library.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS books (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT    NOT NULL,
    author    TEXT    NOT NULL,
    year      INTEGER,
    isbn      TEXT,
    available INTEGER NOT NULL DEFAULT 1
);

-- Cuentas para iniciar sesión. La contraseña nunca se guarda: solo su hash.
-- Los lectores tienen además sus datos y su carnet (con su fecha de vigencia).
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    display_name  TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK (role IN ('librarian', 'reader')),
    password_hash TEXT    NOT NULL,
    dni           TEXT,
    phone         TEXT,
    email         TEXT,
    card_number   TEXT,
    card_expires  TEXT
);

CREATE TABLE IF NOT EXISTS loans (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id        INTEGER NOT NULL REFERENCES books(id),
    reader_id      INTEGER REFERENCES users(id),
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
    ("Don Quijote de la Mancha", "Miguel de Cervantes", 1605, "9788467044812"),
    ("La ciudad y los perros", "Mario Vargas Llosa", 1963, "9788420406961"),
    ("Rayuela", "Julio Cortázar", 1963, "9788437604572"),
    ("Ficciones", "Jorge Luis Borges", 1944, "9788426405739"),
    ("El túnel", "Ernesto Sabato", 1948, "9788437625386"),
]

# ISBN de la primera versión de los datos de ejemplo que eran de otro libro
# (Open Library mostraba, por ejemplo, la portada de «El Aleph» para
# «Ficciones»). Se corrigen también en las bases ya creadas, pero solo si la
# fila sigue teniendo ese título con ese ISBN equivocado.
SEED_ISBN_FIXES = [
    ("Don Quijote de la Mancha", "9788424922580", "9788467044812"),
    ("La ciudad y los perros", "9788420471839", "9788420406961"),
    ("Ficciones", "9788499089515", "9788426405739"),
    ("El túnel", "9788432248160", "9788437625386"),
]

# Columnas añadidas después de la primera versión. `CREATE TABLE IF NOT EXISTS`
# no toca una tabla que ya existe, así que hay que agregarlas a mano para no
# perder los datos de una base de datos anterior.
MIGRATIONS = [
    ("books", "isbn", "TEXT"),
    ("loans", "borrower_dni", "TEXT"),
    ("loans", "borrower_email", "TEXT"),
    ("loans", "borrower_phone", "TEXT"),
    ("loans", "reader_id", "INTEGER REFERENCES users(id)"),
    ("users", "dni", "TEXT"),
    ("users", "phone", "TEXT"),
    ("users", "email", "TEXT"),
    ("users", "card_number", "TEXT"),
    ("users", "card_expires", "TEXT"),
]


def fold(text: Optional[str]) -> str:
    """El texto en minúsculas y sin tildes, para buscar sin distinguirlas.

    «Túnel», «TÚNEL» y «tunel» quedan igual. Se registra en cada conexión como
    función de SQL (`fold(title)`) y se aplica también a lo que se busca.
    """
    if text is None:
        return ""
    decomposed = unicodedata.normalize("NFD", text.casefold())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def _apply_migrations(connection: sqlite3.Connection) -> None:
    # SQLite no admite `?` en los nombres de tabla o columna, así que se
    # interpolan. Es seguro porque salen de MIGRATIONS, nunca del usuario.
    for table, column, column_type in MIGRATIONS:
        existing = {
            row["name"] for row in connection.execute(f"PRAGMA table_info({table})")
        }
        if column not in existing:
            connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")


def _fix_seed_isbns(connection: sqlite3.Connection) -> None:
    """Pone el ISBN correcto a los libros de ejemplo de bases antiguas.

    Solo toca filas con el título de un libro de ejemplo y sin ISBN, o con el
    ISBN equivocado de la primera versión: los libros que agregó cada uno no
    cambian.
    """
    connection.executemany(
        "UPDATE books SET isbn = ? WHERE title = ? AND isbn IS NULL",
        [(isbn, title) for title, _author, _year, isbn in SEED_BOOKS],
    )
    connection.executemany(
        "UPDATE books SET isbn = ? WHERE title = ? AND isbn = ?",
        [(right, title, wrong) for title, wrong, right in SEED_ISBN_FIXES],
    )


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    """Abre una conexión a SQLite, confirma los cambios y siempre la cierra.

    Si dentro del bloque se lanza una excepción, se deshace todo lo escrito en
    él. Las filas son accesibles por nombre de columna (``row["title"]``).
    """
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.create_function("fold", 1, fold, deterministic=True)
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
        _fix_seed_isbns(connection)

        already_loaded = connection.execute("SELECT COUNT(*) FROM books").fetchone()[0]
        if already_loaded == 0:
            connection.executemany(
                "INSERT INTO books (title, author, year, isbn, available) "
                "VALUES (?, ?, ?, ?, 1)",
                SEED_BOOKS,
            )
