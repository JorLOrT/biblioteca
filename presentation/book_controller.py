"""Endpoints REST del catálogo de libros."""

from typing import TypedDict

from flask import Blueprint, Response, jsonify, request

from business.book_service import BookService
from presentation.auth import librarian_required, login_required
from presentation.chat_socket import notify_catalog_changed
from presentation.i18n import translate
from presentation.json_input import request_json, text_field

book_bp = Blueprint("books", __name__, url_prefix="/api/books")
service = BookService()

# Consultar el catálogo: cualquier cuenta. Cambiarlo: solo el bibliotecario.
book_bp.before_request(login_required)


class _BookForm(TypedDict):
    title: str
    author: str
    year: str
    isbn: str


def _book_form() -> _BookForm:
    """Los campos del formulario de un libro, tal como llegan en el JSON."""
    data = request_json()
    return {
        "title": text_field(data, "title"),
        "author": text_field(data, "author"),
        "year": text_field(data, "year"),
        "isbn": text_field(data, "isbn"),
    }


@book_bp.get("")
def list_books() -> Response:
    only_available = request.args.get("available") == "true"
    books = service.list_books(only_available=only_available)
    return jsonify([book.to_dict() for book in books])


@book_bp.get("/<int:book_id>")
def get_book(book_id: int) -> Response:
    return jsonify(service.get_book(book_id).to_dict())


@book_bp.post("")
def create_book() -> tuple[Response, int]:
    librarian_required()
    book = service.create_book(**_book_form())
    notify_catalog_changed()
    return jsonify(book.to_dict()), 201


@book_bp.put("/<int:book_id>")
def update_book(book_id: int) -> Response:
    librarian_required()
    book = service.update_book(book_id, **_book_form())
    notify_catalog_changed()
    return jsonify(book.to_dict())


@book_bp.delete("/<int:book_id>")
def delete_book(book_id: int) -> Response:
    librarian_required()
    service.delete_book(book_id)
    notify_catalog_changed()
    return jsonify({"message": translate("msg.book_deleted")})
