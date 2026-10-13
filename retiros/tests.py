"""
Pruebas de la API y de los reportes. Corren sin las políticas de RLS (las aplica
el entrypoint con psql, no las migraciones), así que cubren la lógica de la
aplicación y los permisos de Django, no el aislamiento por parroquia.

    python manage.py test
"""

from datetime import date
from decimal import Decimal

import tablib
from django.contrib.auth.models import Permission, User
from django.test import TestCase

from .models import (
    AreaServicio, AsignacionServicio, Charla, Diocesis, EstadoPago, Gasto, Inscripcion, Pago,
    Parroquia, Participacion, Persona, Retiro, TipoRetiro,
)
from .reportes import PersonaResource


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser("admin", "a@example.com", "x")
        cls.parroquia = Parroquia.objects.create(
            nombre="San José", diocesis=Diocesis.objects.create(nombre="Diócesis")
        )
        cls.retiro = Retiro.objects.create(
            parroquia=cls.parroquia, tipo=TipoRetiro.objects.create(nombre="Emaús hombres"),
            edicion=12, fecha_inicio=date(2027, 3, 12), fecha_fin=date(2027, 3, 14),
            cupo=3, cuota=Decimal("100"),
        )

    def setUp(self):
        self.client.force_login(self.admin)

    def persona(self, nombre, **datos):
        return Persona.objects.create(parroquia=self.parroquia, nombre=nombre, **datos)

    def post(self, ruta, datos):
        return self.client.post(ruta, datos, content_type="application/json")


class EstadoPagoTests(TestCase):
    def test_segun_lo_pagado(self):
        self.assertEqual(EstadoPago.de(None, 100), EstadoPago.PENDIENTE)
        self.assertEqual(EstadoPago.de(Decimal("40"), 100), EstadoPago.PARCIAL)
        self.assertEqual(EstadoPago.de(Decimal("100"), 100), EstadoPago.PAGADO)


class ModulosTests(Base):
    def test_exige_sesion(self):
        self.client.logout()
        for ruta in ("/api/retiros/", "/api/esquema/", "/api/resumen/",
                     f"/api/retiros/{self.retiro.pk}/panel/"):
            self.assertEqual(self.client.get(ruta).status_code, 403, ruta)

    def test_esquema_describe_los_modulos(self):
        modulos = {m["slug"]: m for m in self.client.get("/api/esquema/").json()}
        self.assertIn("pagos", modulos)
        inscripciones = modulos["inscripciones"]
        pago = next(c for c in inscripciones["lista"] if c["nombre"] == "estado_pago")
        self.assertEqual(pago["tipo"], "opcion")
        self.assertEqual(len(pago["opciones"]), 3)
        self.assertTrue(inscripciones["puede_agregar"])

    def test_sin_permiso_de_pagos_no_ve_columnas_de_pago(self):
        user = User.objects.create_user("secretaria", password="x")
        user.user_permissions.add(Permission.objects.get(codename="view_inscripcion"))
        self.client.force_login(user)
        Inscripcion.objects.create(retiro=self.retiro, persona=self.persona("Ana"))

        (modulo,) = self.client.get("/api/esquema/").json()
        self.assertNotIn("estado_pago", [c["nombre"] for c in modulo["lista"]])
        self.assertFalse(modulo["puede_agregar"])
        (fila,) = self.client.get("/api/inscripciones/").json()["results"]
        self.assertNotIn("total_pagado", fila)
        self.assertNotIn("salud_alimentacion", fila)  # sin rol de RLS: nada confidencial
        self.assertEqual(self.post("/api/inscripciones/", {}).status_code, 403)

    def test_lista_de_inscripciones_trae_el_estado_de_pago(self):
        inscripcion = Inscripcion.objects.create(retiro=self.retiro, persona=self.persona("Ana"))
        Pago.objects.create(retiro=self.retiro, inscripcion=inscripcion, monto=40,
                            concepto=Pago.Concepto.CUOTA, fecha=date(2027, 1, 5))
        (fila,) = self.client.get("/api/inscripciones/").json()["results"]
        self.assertEqual(fila["estado_pago"], "parcial")
        self.assertEqual(fila["total_pagado"], 40)
        self.assertEqual(fila["persona_etiqueta"], "Ana")

    def test_validaciones_del_modelo_salen_junto_al_campo(self):
        r = self.client.patch(
            f"/api/retiros/{self.retiro.pk}/", {"fecha_fin": "2027-03-01"},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("fecha_fin", r.json())

        ana = self.persona("Ana")
        r = self.post("/api/inscripciones/", {
            "retiro": str(self.retiro.pk), "persona": str(ana.pk), "padrino": str(ana.pk),
        })
        self.assertIn("padrino", r.json())

        r = self.post("/api/gastos/", {
            "retiro": str(self.retiro.pk), "categoria": "comida", "descripcion": "Pan",
            "monto": 0, "fecha": "2027-03-01",
        })
        self.assertIn("monto", r.json())

    def pago(self, **datos):
        return self.post("/api/pagos/", {
            "retiro": str(self.retiro.pk), "concepto": "donativo", "fecha": "2027-03-01",
            **datos,
        })

    def test_pago_en_la_moneda_base(self):
        # Sin moneda toma la base, y la tasa sobra aunque la manden.
        r = self.pago(monto=50, tasa=180)
        self.assertEqual(r.status_code, 201, r.content)
        pago = r.json()
        self.assertEqual((pago["moneda"], pago["tasa"], pago["monto_base"]), ("USD", None, 50))

    def test_pago_en_otra_moneda_se_convierte_con_su_tasa(self):
        r = self.pago(monto=9000, moneda="VES")
        self.assertEqual(r.status_code, 400)
        self.assertIn("tasa", r.json())
        self.assertIn("moneda", self.pago(monto=10, moneda="MXN").json())

        r = self.pago(monto=9000, moneda="VES", tasa="180.5")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["monto_base"], 49.86)

        # Al corregir la tasa se recalcula el equivalente.
        r = self.client.patch(f"/api/pagos/{r.json()['id']}/", {"tasa": 180},
                              content_type="application/json")
        self.assertEqual(r.json()["monto_base"], 50)

    def test_la_cuota_se_cubre_con_pagos_en_varias_monedas(self):
        inscripcion = Inscripcion.objects.create(retiro=self.retiro, persona=self.persona("Ana"))
        comunes = {"inscripcion": str(inscripcion.pk), "concepto": "cuota"}
        self.pago(monto=9000, moneda="VES", tasa=180, **comunes)   # 50 USD
        self.pago(monto=46, moneda="EUR", tasa="0.92", **comunes)  # 50 USD
        (fila,) = self.client.get("/api/inscripciones/").json()["results"]
        self.assertEqual((fila["total_pagado"], fila["estado_pago"]), (100, "pagado"))
        self.assertEqual(self.client.get("/api/resumen/").json()["ingresos"], 100)

    def test_inscripcion_duplicada_y_borrado_protegido(self):
        ana = self.persona("Ana")
        datos = {"retiro": str(self.retiro.pk), "persona": str(ana.pk)}
        self.assertEqual(self.post("/api/inscripciones/", datos).status_code, 201)
        self.assertEqual(self.post("/api/inscripciones/", datos).status_code, 400)
        self.assertEqual(self.client.delete(f"/api/personas/{ana.pk}/").status_code, 409)

    def test_sesion_informa_moneda_y_region(self):
        sesion = self.client.get("/api/auth/sesion/").json()
        self.assertEqual((sesion["moneda"], sesion["region"]), ("USD", "es-VE"))


class PanelRetiroTests(Base):
    def setUp(self):
        super().setUp()
        ana, luis, marta, pedro = (self.persona(n) for n in ("Ana", "Luis", "Marta", "Pedro"))
        pagada = Inscripcion.objects.create(
            retiro=self.retiro, persona=ana, padrino=luis,
            estado=Inscripcion.Estado.CONFIRMADA,
        )
        Inscripcion.objects.create(retiro=self.retiro, persona=marta)
        Inscripcion.objects.create(
            retiro=self.retiro, persona=pedro, estado=Inscripcion.Estado.CANCELADA
        )
        Pago.objects.create(retiro=self.retiro, inscripcion=pagada, persona=ana, monto=100,
                            concepto=Pago.Concepto.CUOTA, fecha=date(2027, 1, 5))
        Pago.objects.create(retiro=self.retiro, monto=30, concepto=Pago.Concepto.DONATIVO,
                            fecha=date(2027, 1, 6))
        Gasto.objects.create(retiro=self.retiro, categoria=Gasto.Categoria.COMIDA,
                             descripcion="Mercado", monto=50, fecha=date(2027, 3, 1))
        cocina = AreaServicio.objects.create(nombre="Cocina")
        servidor = Participacion.objects.create(
            retiro=self.retiro, persona=luis, tipo=Participacion.Tipo.SERVIDOR
        )
        AsignacionServicio.objects.create(participacion=servidor, area=cocina,
                                          es_coordinador=True)
        Participacion.objects.create(
            retiro=self.retiro, persona=pedro, tipo=Participacion.Tipo.SERVIDOR
        )
        Charla.objects.create(retiro=self.retiro, tema="El hijo pródigo", orden=1,
                              expositor=luis)
        self.ruta = f"/api/retiros/{self.retiro.pk}/panel/"

    def test_junta_caminantes_equipo_charlas_y_finanzas(self):
        panel = self.client.get(self.ruta).json()

        caminantes = panel["caminantes"]
        self.assertEqual((caminantes["inscritos"], caminantes["disponibles"]), (2, 1))
        ana = caminantes["filas"][0]
        self.assertEqual((ana["persona"], ana["padrino"], ana["estado_pago"], ana["saldo"]),
                         ("Ana", "Luis", "pagado", 0))
        self.assertEqual(caminantes["filas"][1]["estado_pago"], "pendiente")

        equipo = panel["equipo"]
        self.assertEqual(equipo["total"], 2)
        self.assertEqual(equipo["areas"], [
            {"area": "Cocina", "personas": [{"nombre": "Luis", "es_coordinador": True}]}
        ])
        self.assertEqual(equipo["sin_area"], ["Pedro"])

        self.assertEqual(panel["charlas"][0]["expositor"], "Luis")

        finanzas = panel["finanzas"]
        self.assertEqual((finanzas["ingresos"], finanzas["egresos"], finanzas["balance"]),
                         (130, 50, 80))
        # Falta la cuota de Marta; la inscripción cancelada de Pedro no cuenta.
        self.assertEqual(finanzas["por_cobrar"], 100)
        self.assertEqual(
            {c["valor"]: c["total"] for c in finanzas["por_concepto"] if c["total"]},
            {"cuota": 100, "donativo": 30},
        )

    def test_cada_seccion_exige_su_permiso(self):
        user = User.objects.create_user("servidor", password="x")
        self.client.force_login(user)
        self.assertEqual(self.client.get(self.ruta).status_code, 403)

        user.user_permissions.add(
            *Permission.objects.filter(codename__in=["view_retiro", "view_inscripcion"])
        )
        panel = self.client.get(self.ruta).json()
        self.assertIsNone(panel["finanzas"])
        self.assertIsNone(panel["equipo"])
        self.assertNotIn("pagado", panel["caminantes"]["filas"][0])

    def test_retiro_inexistente(self):
        ruta = "/api/retiros/00000000-0000-0000-0000-000000000000/panel/"
        self.assertEqual(self.client.get(ruta).status_code, 404)

    def test_resumen(self):
        resumen = self.client.get("/api/resumen/").json()
        self.assertEqual((resumen["inscripciones"], resumen["balance"]), (3, 80))
        self.assertEqual(resumen["proximos_retiros"][0]["inscritos"], 2)


class ReportesTests(Base):
    def test_pdf_exige_sesion_y_permiso(self):
        ruta = f"/retiros/{self.retiro.pk}/lista.pdf"
        self.client.logout()
        r = self.client.get(ruta)
        self.assertEqual(r.status_code, 302)
        self.assertTrue(r["Location"].startswith("/signin"))

        self.client.force_login(User.objects.create_user("otro", password="x"))
        self.assertEqual(self.client.get(ruta).status_code, 403)

    def test_pdf_de_confirmados(self):
        Inscripcion.objects.create(retiro=self.retiro, persona=self.persona("Ana"),
                                   estado=Inscripcion.Estado.CONFIRMADA)
        r = self.client.get(f"/retiros/{self.retiro.pk}/lista.pdf")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.content.startswith(b"%PDF"))
        self.assertIn("lista-emaus-hombres-12.pdf", r["Content-Disposition"])

        falso = "/retiros/00000000-0000-0000-0000-000000000000/lista.pdf"
        self.assertEqual(self.client.get(falso).status_code, 404)

    def test_importar_personas_no_duplica(self):
        self.persona("Ana Pérez", email="ana@example.com")
        self.persona("Sin correo 1")
        self.persona("Sin correo 2")
        datos = tablib.Dataset(
            ["Ana María Pérez", "", "ana@example.com", "", "San José"],
            ["Luis Gómez", 3001234567, "", "1990-05-01", "San José"],
            ["Otra sin correo", "", "", "", "San José"],
            headers=["nombre", "telefono", "email", "fecha_nacimiento", "parroquia"],
        )
        resultado = PersonaResource().import_data(datos, raise_errors=True)

        self.assertFalse(resultado.has_errors())
        self.assertEqual(Persona.objects.count(), 5)
        self.assertEqual(Persona.objects.get(email="ana@example.com").nombre, "Ana María Pérez")
        luis = Persona.objects.get(nombre="Luis Gómez")
        self.assertEqual((luis.telefono, luis.parroquia), ("3001234567", self.parroquia))

        # Reimportar el mismo archivo no crea a nadie más con correo o teléfono.
        PersonaResource().import_data(datos, raise_errors=True)
        self.assertEqual(Persona.objects.filter(nombre="Luis Gómez").count(), 1)

    def test_exportar_personas_omite_datos_sensibles(self):
        self.persona("Ana", datos_sensibles={"direccion": "Calle 1"})
        exportado = PersonaResource().export()
        self.assertEqual(exportado.headers,
                         ["nombre", "telefono", "email", "fecha_nacimiento", "parroquia"])
        self.assertEqual(exportado[0][4], "San José")
