"""
Leer planillas en papel (fotos o PDF escaneados) con Tesseract, en el propio
servidor: nada sale a servicios externos.

- lectura.py: de la foto o el PDF al texto, línea por línea, con la posición
  y la confianza de cada palabra.
- planilla.py: de ese texto a los campos de un formulario (caminante o
  servidor), buscando las etiquetas de la planilla y la forma de los datos.
- listado.py: de una hoja tabulada (como las de control) a filas.
- catalogos.py: nombres leídos -> estado, ciudad o área del sistema.

Con letra a mano el OCR se equivoca: todo lo que se lee se propone para
revisarlo, nunca se guarda solo.
"""
