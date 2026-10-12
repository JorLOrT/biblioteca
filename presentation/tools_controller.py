"""Endpoints STATELESS.

No tocan la base de datos ni la sesión: todo lo que necesitan viene en la URL.
Dos peticiones idénticas devuelven siempre la misma respuesta.
"""

from flask import Blueprint, Response, jsonify, request

from business.library_calculator import (
    DAILY_FINE,
    DEFAULT_LOAN_DAYS,
    calculate_due_date,
    calculate_fine,
)
from business.validators import parse_int
from presentation.auth import login_required

tools_bp = Blueprint("tools", __name__, url_prefix="/api/tools")
tools_bp.before_request(login_required)


@tools_bp.get("/due-date")
def due_date() -> Response:
    """GET /api/tools/due-date?loan_date=2026-03-01&days=15"""
    loan_date = request.args.get("loan_date", "")
    days = parse_int(
        request.args.get("days", DEFAULT_LOAN_DAYS), "error.days_not_number"
    )

    result = calculate_due_date(loan_date, days)
    return jsonify({"loan_date": loan_date, "days": days, "due_date": result})


@tools_bp.get("/fine")
def fine() -> Response:
    """GET /api/tools/fine?due_date=2026-03-16&reference_date=2026-03-20"""
    due = request.args.get("due_date", "")
    reference = request.args.get("reference_date", "")

    result = calculate_fine(due, reference)
    return jsonify(
        {
            "due_date": due,
            "reference_date": reference,
            "daily_rate": DAILY_FINE,
            "days_late": result["days_late"],
            "fine": result["fine"],
        }
    )
