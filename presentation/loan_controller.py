"""Endpoints REST de los préstamos."""

from flask import Blueprint, Response, jsonify

from business.loan_service import LoanService
from business.validators import parse_int
from presentation.json_input import request_json, text_field

loan_bp = Blueprint("loans", __name__, url_prefix="/api/loans")
service = LoanService()


@loan_bp.get("")
def list_loans() -> Response:
    loans = service.list_loans()
    return jsonify([loan.to_dict() for loan in loans])


@loan_bp.post("")
def lend_book() -> tuple[Response, int]:
    data = request_json()
    loan = service.lend_book(
        book_id=parse_int(data.get("book_id"), "error.book_required"),
        borrower=text_field(data, "borrower"),
        dni=text_field(data, "dni"),
        email=text_field(data, "email"),
        phone=text_field(data, "phone"),
    )
    return jsonify(loan.to_dict()), 201


@loan_bp.post("/<int:loan_id>/return")
def return_book(loan_id: int) -> Response:
    loan = service.return_book(loan_id)
    return jsonify(loan.to_dict())
