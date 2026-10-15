"""
Pruebas de la API y de los reportes. Corren sin las políticas de RLS (las aplica
el entrypoint con psql, no las migraciones), así que cubren la lógica de la
aplicación y los permisos de Django, no el aislamiento por parroquia.

    python manage.py test
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

import tablib
from django.contrib.auth.models import Permission, User
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from . import tasas
from .models import (
    AreaServicio, AsignacionRol, AsignacionServicio, Charla, Diocesis, EstadoPago, Gasto,
    Inscripcion, Pago, Parroquia, Participacion, Persona, Retiro, Rol, Tarea, TipoRetiro,
    Usuario,
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
        # Las pruebas no salen a internet: el BCV "publica" 180 Bs por dólar y
        # 200 por euro, salvo que una prueba cambie self.bcv.side_effect.
        cache.clear()
        self.bcv = mock.patch.object(tasas, "_consultar", return_value={
            "bolivares": {"VES": Decimal(1), "USD": Decimal(180), "EUR": Decimal(200)},
            "fecha": "2027-03-01",
        }).start()
        self.addCleanup(mock.patch.stopall)

    def persona(self, nombre, **datos):
        return Persona.objects.create(parroquia=self.parroquia, nombre=nombre, **datos)

    def post(self, ruta, datos):
        return self.client.post(ruta, datos, content_type="application/json")


class EstadoPagoTests(TestCase):
    def test_segun_lo_pagado(self):
        self.assertEqual(EstadoPago.de(None, 100), EstadoPago.PENDIENTE)
        self.assertEqual(EstadoPago.de(Decimal("40"), 100), EstadoPago.PARCIAL)
        self.assertEqual(EstadoPago.de(Decimal("100"), 100), EstadoPago.PAGADO)
        self.assertEqual(EstadoPago.de(None, 0), EstadoPago.PAGADO)  # sin cuota no debe


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

    def test_la_cuota_se_liga_a_la_inscripcion_con_solo_elegir_la_persona(self):
        ana = self.persona("Ana")
        inscripcion = Inscripcion.objects.create(retiro=self.retiro, persona=ana)
        r = self.pago(monto=40, concepto="cuota", persona=str(ana.pk))
        self.assertEqual(r.json()["inscripcion"], str(inscripcion.pk))

    def test_pago_en_la_moneda_base(self):
        # Sin moneda toma la base, y la tasa sobra aunque la manden.
        r = self.pago(monto=50, tasa=180)
        self.assertEqual(r.status_code, 201, r.content)
        pago = r.json()
        self.assertEqual((pago["moneda"], pago["tasa"], pago["monto_base"]), ("USD", None, 50))

    def test_pago_en_otra_moneda_se_convierte_con_su_tasa(self):
        self.assertIn("moneda", self.pago(monto=10, moneda="MXN").json())

        r = self.pago(monto=9000, moneda="VES", tasa="180.5")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["monto_base"], 49.86)
        self.bcv.assert_not_called()  # con la tasa escrita no se consulta el BCV

        # Al corregir la tasa se recalcula el equivalente.
        r = self.client.patch(f"/api/pagos/{r.json()['id']}/", {"tasa": 180},
                              content_type="application/json")
        self.assertEqual(r.json()["monto_base"], 50)

    def test_sin_tasa_se_usa_la_del_bcv(self):
        pago = self.pago(monto=9000, moneda="VES").json()
        self.assertEqual((pago["tasa"], pago["monto_base"]), (180, 50))
        # Euros a dólares pasando por bolívares: 180 / 200 = 0,9 EUR por dólar.
        pago = self.pago(monto=45, moneda="EUR").json()
        self.assertEqual((pago["tasa"], pago["monto_base"]), (0.9, 50))
        self.assertEqual(self.bcv.call_count, 1)  # la segunda sale de la caché

        # El pago conserva su tasa aunque el BCV publique otra después.
        cache.clear()
        self.bcv.return_value["bolivares"]["USD"] = Decimal(190)
        r = self.client.patch(f"/api/pagos/{pago['id']}/", {"referencia": "A-1"},
                              content_type="application/json")
        self.assertEqual(r.json()["tasa"], 0.9)

        tasas_bcv = self.client.get("/api/resumen/").json()["tasas_bcv"]
        self.assertEqual(tasas_bcv, {"fecha": "2027-03-01", "USD": 190, "EUR": 200})

    def test_si_el_bcv_no_responde_se_pide_la_tasa(self):
        self.bcv.side_effect = OSError("sin red")
        with self.assertLogs("retiros.tasas", "ERROR"):
            r = self.pago(monto=9000, moneda="VES")
        self.assertEqual(r.status_code, 400)
        self.assertIn("tasa", r.json())
        self.assertEqual(self.pago(monto=9000, moneda="VES", tasa=180).status_code, 201)
        self.assertEqual(self.pago(monto=20).status_code, 201)  # en dólares no hace falta
        self.assertIsNone(self.client.get("/api/resumen/").json()["tasas_bcv"])
        self.assertEqual(self.bcv.call_count, 1)  # el fallo no se reintenta en cada petición

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

    def test_ficha_de_cada_caminante(self):
        ana = Inscripcion.objects.get(persona__nombre="Ana")
        ana.persona.fecha_nacimiento = date(1990, 3, 13)
        ana.persona.datos_sensibles = {"procedencia": "Maracay", "celular": "0414"}
        ana.persona.save()
        ana.salud_alimentacion = {"tratamiento": "Insulina", "regimen_alimenticio": "Sin sal",
                                  "requerimientos": "Silla de ruedas"}
        ana.contacto_emergencia = {"nombre": "Rosa", "relacion": "Madre", "telefono": "0412",
                                   "celular": "0424", "nombre2": "Juan", "telefono2": "0416"}
        ana.save()

        ficha = self.client.get(self.ruta).json()["caminantes"]["filas"][0]["ficha"]
        self.assertEqual(ficha["edad"], 36)  # cumple 37 el día después de empezar
        self.assertEqual(
            (ficha["procedencia"], ficha["tratamiento"], ficha["alimentacion"],
             ficha["requerimientos"]),
            ("Maracay", "Insulina", "Sin sal", "Silla de ruedas"),
        )
        self.assertEqual(ficha["contactos"], [
            {"nombre": "Rosa", "relacion": "Madre", "telefono": "0412 / 0424"},
            {"nombre": "Juan", "relacion": "", "telefono": "0416"},
        ])

    def test_lo_que_debe_cada_servidor(self):
        self.retiro.cuota_servidor = 50
        self.retiro.save()
        luis = Persona.objects.get(nombre="Luis")
        Pago.objects.create(retiro=self.retiro, persona=luis, monto=20,
                            concepto=Pago.Concepto.APORTACION, fecha=date(2027, 1, 7))

        servidores = self.client.get(self.ruta).json()["servidores"]
        self.assertEqual(
            [(f["persona"], f["areas"], f["pagado"], f["saldo"], f["estado_pago"])
             for f in servidores["filas"]],
            [("Luis", "Cocina", 20, 30, "parcial"), ("Pedro", "", 0, 50, "pendiente")],
        )
        self.assertEqual(servidores["por_cobrar"], 80)

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
        self.assertIsNone(panel["servidores"])
        tablero = self.client.get("/api/resumen/").json()["tablero"]
        self.assertIsNone(tablero["finanzas"])
        self.assertIsNone(tablero["tareas"])
        self.assertNotIn("pagos", tablero["caminantes"])
        self.assertNotIn("pagado", panel["caminantes"]["filas"][0])
        self.assertNotIn("ficha", panel["caminantes"]["filas"][0])  # sin rol confidencial

    def test_tablero_del_inicio(self):
        hoy = timezone.localdate()
        Persona.objects.filter(nombre="Ana").update(
            fecha_nacimiento=(hoy + timedelta(days=5)).replace(year=1990))
        Persona.objects.filter(nombre="Luis").update(fecha_nacimiento=date(1980, 3, 13))
        Tarea.objects.create(retiro=self.retiro, titulo="Comprar velas",
                             fecha_limite=hoy - timedelta(days=1))
        Tarea.objects.create(retiro=self.retiro, titulo="Reservar bus")
        Tarea.objects.create(retiro=self.retiro, titulo="Hecha", hecha=True)

        tablero = self.client.get("/api/resumen/").json()["tablero"]
        self.assertEqual(tablero["retiro"]["id"], str(self.retiro.pk))
        self.assertEqual(tablero["dias_para_inicio"], (self.retiro.fecha_inicio - hoy).days)

        caminantes = tablero["caminantes"]
        self.assertEqual(
            (caminantes["inscritos"], caminantes["confirmados"], caminantes["por_confirmar"],
             caminantes["cancelados"], caminantes["por_cobrar"]),
            (2, 1, 1, 1, 100),
        )
        self.assertEqual({p["valor"]: p["total"] for p in caminantes["pagos"]},
                         {"pagado": 1, "parcial": 0, "pendiente": 1})
        self.assertEqual(tablero["servidores"]["por_area"], [{"area": "Cocina", "total": 1}])

        tareas = tablero["tareas"]
        self.assertEqual((tareas["pendientes"], tareas["vencidas"], tareas["hechas"]), (2, 1, 1))
        self.assertEqual([t["titulo"] for t in tareas["proximas"]],
                         ["Comprar velas", "Reservar bus"])

        self.assertEqual(
            [(c["nombre"], c["durante_retiro"]) for c in tablero["cumpleanos"]],
            [("Ana", False), ("Luis", True)],
        )
        alertas = {a["clave"]: a["total"] for a in tablero["alertas"]}
        self.assertEqual(alertas["por_confirmar"], 1)
        self.assertEqual(alertas["caminantes_deben"], 1)
        self.assertEqual(alertas["sin_area"], 1)
        self.assertEqual(
            [p["total"] for p in tablero["finanzas"]["recaudacion"]], [100, 130])

    def test_tablero_de_otro_retiro(self):
        otro = Retiro.objects.create(
            parroquia=self.parroquia, tipo=self.retiro.tipo, edicion=13,
            fecha_inicio=date(2027, 9, 1), fecha_fin=date(2027, 9, 3),
        )
        resumen = self.client.get(f"/api/resumen/?retiro={otro.pk}").json()
        self.assertEqual(resumen["tablero"]["retiro"]["id"], str(otro.pk))
        self.assertEqual(len(resumen["retiros_tablero"]), 2)

    def test_retiro_inexistente(self):
        ruta = "/api/retiros/00000000-0000-0000-0000-000000000000/panel/"
        self.assertEqual(self.client.get(ruta).status_code, 404)

    def test_resumen(self):
        resumen = self.client.get("/api/resumen/").json()
        self.assertEqual((resumen["inscripciones"], resumen["balance"]), (3, 80))
        self.assertEqual(resumen["proximos_retiros"][0]["inscritos"], 2)


class AccesoPorRolTests(Base):
    """Coordinación y logística entran con su cuenta y obtienen permisos de su rol."""

    def entrar_como(self, rol):
        cuenta = User.objects.create_user(rol, password="x")
        usuario = Usuario.objects.create(persona=self.persona(rol), cuenta=cuenta)
        AsignacionRol.objects.create(usuario=usuario, rol=rol, retiro=self.retiro)
        self.client.force_login(cuenta)
        return usuario

    def setUp(self):
        super().setUp()
        self.ana = Inscripcion.objects.create(retiro=self.retiro, persona=self.persona("Ana"))
        self.ruta = f"/api/retiros/{self.retiro.pk}/panel/"

    def test_sin_rol_no_ve_nada(self):
        self.client.force_login(User.objects.create_user("nadie", password="x"))
        self.assertEqual(self.client.get(self.ruta).status_code, 403)
        self.assertEqual(self.client.get("/api/esquema/").json(), [])

    def test_logistica_edita_caminantes_y_consulta_pagos(self):
        self.entrar_como(Rol.LOGISTICA)
        panel = self.client.get(self.ruta).json()
        self.assertIn("ficha", panel["caminantes"]["filas"][0])
        self.assertIsNotNone(panel["finanzas"])

        r = self.client.patch(f"/api/inscripciones/{self.ana.pk}/",
                              {"salud_alimentacion": {"tratamiento": "Insulina"}},
                              content_type="application/json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.client.get("/api/pagos/").status_code, 200)
        pago = {"retiro": str(self.retiro.pk), "concepto": "cuota", "monto": 10,
                "fecha": "2027-03-01", "inscripcion": str(self.ana.pk)}
        self.assertEqual(self.post("/api/pagos/", pago).status_code, 403)

    def test_coordinacion_registra_pagos(self):
        self.entrar_como(Rol.COORD_RETIRO)
        pago = {"retiro": str(self.retiro.pk), "concepto": "cuota", "monto": 100,
                "fecha": "2027-03-01", "inscripcion": str(self.ana.pk)}
        self.assertEqual(self.post("/api/pagos/", pago).status_code, 201)
        (fila,) = self.client.get(self.ruta).json()["caminantes"]["filas"]
        self.assertEqual((fila["estado_pago"], fila["saldo"]), ("pagado", 0))

    def test_usuario_inactivo_pierde_el_acceso(self):
        usuario = self.entrar_como(Rol.COORD_RETIRO)
        usuario.activo = False
        usuario.save()
        self.assertEqual(self.client.get(self.ruta).status_code, 403)


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
