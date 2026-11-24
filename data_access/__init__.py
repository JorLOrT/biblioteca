"""Capa de Acceso a Datos: el único lugar con SQL o con la dirección de otro servicio.

Solo depende de la capa de Entidades. Su trabajo es traducir filas de SQLite a
objetos Book/Loan/User y viceversa, y las respuestas de countries.dev a objetos
Country/Language. No valida nada ni conoce reglas de negocio.

La capa de negocio entra por `unit_of_work`, que agrupa en una transacción
las operaciones de un mismo caso de uso.
"""
