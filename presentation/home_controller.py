"""Sirve la página web de la biblioteca."""

from flask import Blueprint, render_template

home_bp = Blueprint("home", __name__)


@home_bp.get("/")
def index():
    return render_template("index.html")
