"""Paginación de la API (DEFAULT_PAGINATION_CLASS en settings)."""

from rest_framework import pagination


class Paginacion(pagination.PageNumberPagination):
    """25 por página; el listado puede pedir otro tamaño con ?page_size= (hasta 100)."""
    page_size_query_param = "page_size"
    max_page_size = 100
