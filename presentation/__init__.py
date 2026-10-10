"""Capa de Presentación: la cara visible de la aplicación.

Traduce peticiones HTTP a llamadas de la capa de Negocio y respuestas del
negocio a JSON o HTML. Nunca habla directamente con la base de datos: no
importa `sqlite3` ni ningún repositorio.

Es también la única capa que conoce la sesión del usuario: la lee, se la pasa
al negocio y guarda de vuelta el resultado.
"""
