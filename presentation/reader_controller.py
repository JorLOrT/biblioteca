"""Endpoints de los lectores: sus cuentas y su carnet.

El bibliotecario los lista, los crea, los edita y les renueva el carnet. Cada
lector solo puede ver su propia cuenta, en `/api/readers/me`.
"""

from flask import Blueprint, Response, jsonify

from business.reader_service import ReaderForm, ReaderService
from presentation.auth import (
    current_user,
    librarian_required,
    login_required,
    reader_required,
)
from presentation.chat_socket import notify_data_changed
from presentation.json_input import request_json, text_field

reader_bp = Blueprint("readers", __name__, url_prefix="/api/readers")
service = ReaderService()
reader_bp.before_request(login_required)


def _reader_form(data: dict[str, object]) -> ReaderForm:
    """Los campos del formulario de un lector, tal como llegan en el JSON."""
    return {
        "name": text_field(data, "name"),
        "dni": text_field(data, "dni"),
        "phone": text_field(data, "phone"),
        "email": text_field(data, "email"),
        "card_expires": text_field(data, "card_expires"),
        "password": text_field(data, "password"),
    }


@reader_bp.get("")
def list_readers() -> Response:
    librarian_required()
    return jsonify([reader.to_dict() for reader in service.list_readers()])


@reader_bp.get("/me")
def my_account() -> Response:
    """La cuenta del lector que pregunta: sus datos, su carnet y su préstamo."""
    reader_required()
    user = current_user()
    username = user["username"] if user else ""
    return jsonify(service.profile(username).to_dict())


@reader_bp.post("")
def create_reader() -> tuple[Response, int]:
    librarian_required()
    data = request_json()
    reader = service.create_reader(text_field(data, "username"), _reader_form(data))
    notify_data_changed()
    return jsonify(reader.to_dict()), 201


@reader_bp.put("/<int:reader_id>")
def update_reader(reader_id: int) -> Response:
    librarian_required()
    reader = service.update_reader(reader_id, _reader_form(request_json()))
    notify_data_changed()
    return jsonify(reader.to_dict())


@reader_bp.post("/<int:reader_id>/renew")
def renew_card(reader_id: int) -> Response:
    librarian_required()
    reader = service.renew_card(reader_id)
    notify_data_changed()
    return jsonify(reader.to_dict())
