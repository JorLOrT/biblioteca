"""Lectores: sus cuentas, sus datos y su carnet.

El bibliotecario crea la cuenta de cada lector con su nombre, DNI, celular y
correo, que se comprueban con los mismos regex de `validators` que el resto de
la aplicación. Cada cuenta lleva un carnet con número propio y una fecha de
vigencia: con el carnet vencido no se le presta nada hasta renovarlo.

Esos datos son los que se copian en cada préstamo: el bibliotecario elige al
lector y no tiene que volver a escribirlos.
"""

from dataclasses import replace
from datetime import date
from typing import TypedDict

from business.exceptions import BusinessError, ForbiddenError
from business.lending_rules import require_reader, with_reader_status
from business.passwords import hash_password
from business.validators import validate_field
from data_access.unit_of_work import UnitOfWork, unit_of_work
from entities.user import READER, User

CARD_PREFIX = "BIB-"


class ReaderForm(TypedDict):
    """Los campos del formulario de un lector, tal como llegan."""

    name: str
    dni: str
    phone: str
    email: str
    card_expires: str
    # Al editar, una contraseña vacía deja la que había.
    password: str


def one_year_after(day: date) -> date:
    """El mismo día del año siguiente (el 29 de febrero pasa al 28)."""
    try:
        return day.replace(year=day.year + 1)
    except ValueError:
        return day.replace(year=day.year + 1, day=28)


def _card_date(value: str) -> str:
    try:
        return date.fromisoformat(value.strip()).isoformat()
    except ValueError:
        raise BusinessError("error.invalid_card_expires") from None


def _with_profile(reader: User, form: ReaderForm) -> User:
    """El lector con los datos del formulario, ya comprobados con sus regex."""
    return replace(
        reader,
        display_name=validate_field("borrower", form["name"]),
        dni=validate_field("dni", form["dni"]),
        phone=validate_field("phone", form["phone"]),
        email=validate_field("email", form["email"]),
        card_expires=_card_date(form["card_expires"]),
    )


def _ensure_unique(uow: UnitOfWork, reader: User) -> None:
    """Regla: ni el usuario ni el DNI se repiten entre cuentas."""
    same_user = uow.users.get_by_username(reader.username)
    if same_user is not None and same_user.id != reader.id:
        raise BusinessError("error.username_taken", username=reader.username)
    same_dni = uow.users.get_by_dni(reader.dni or "")
    if same_dni is not None and same_dni.id != reader.id:
        raise BusinessError("error.dni_taken", dni=reader.dni)


class ReaderService:
    """Gestiona las cuentas de los lectores. Solo lo usa el bibliotecario."""

    def list_readers(self) -> list[User]:
        """Todos los lectores, con su carnet y sus préstamos actuales."""
        today = date.today().isoformat()
        with unit_of_work() as uow:
            return [
                with_reader_status(uow, reader, today)
                for reader in uow.users.get_by_role(READER)
            ]

    def get_reader(self, reader_id: int) -> User:
        with unit_of_work() as uow:
            reader = require_reader(uow, reader_id)
            return with_reader_status(uow, reader, date.today().isoformat())

    def create_reader(self, username: str, form: ReaderForm) -> User:
        """Crea la cuenta y le da un carnet: BIB- y el número de la cuenta."""
        password = validate_field("password", form["password"])
        blank = User(
            id=None,
            username=validate_field("username", username).lower(),
            display_name="",
            role=READER,
            password_hash="",
        )
        reader = _with_profile(blank, form)
        # El hash se calcula al final: es lo más costoso y no tiene sentido
        # hacerlo si algún otro dato no es válido.
        reader.password_hash = hash_password(password)

        with unit_of_work() as uow:
            _ensure_unique(uow, reader)
            created = uow.users.create(reader)
            created.card_number = f"{CARD_PREFIX}{created.id:04d}"
            uow.users.update(created)
            return with_reader_status(uow, created, date.today().isoformat())

    def update_reader(self, reader_id: int, form: ReaderForm) -> User:
        """Cambia los datos y la vigencia. El usuario y el carnet no cambian."""
        with unit_of_work() as uow:
            reader = _with_profile(require_reader(uow, reader_id), form)
            if form["password"]:
                reader.password_hash = hash_password(
                    validate_field("password", form["password"])
                )
            _ensure_unique(uow, reader)
            uow.users.update(reader)
            return with_reader_status(uow, reader, date.today().isoformat())

    def renew_card(self, reader_id: int) -> User:
        """Un año más de vigencia: desde hoy si ya venció, o desde su vencimiento."""
        today = date.today()
        with unit_of_work() as uow:
            reader = require_reader(uow, reader_id)
            expires = date.fromisoformat(reader.card_expires or today.isoformat())
            reader.card_expires = one_year_after(max(today, expires)).isoformat()
            uow.users.update(reader)
            return with_reader_status(uow, reader, today.isoformat())

    def profile(self, username: str) -> User:
        """La cuenta de quien inició sesión, con su carnet y lo que tiene prestado."""
        with unit_of_work() as uow:
            reader = uow.users.get_by_username(username)
            if reader is None or reader.role != READER:
                raise ForbiddenError("error.forbidden")
            return with_reader_status(uow, reader, date.today().isoformat())
