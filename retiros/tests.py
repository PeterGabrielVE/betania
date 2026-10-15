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
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from . import tasas
from .models import (
    AreaServicio, AsignacionRol, AsignacionServicio, Charla, Ciudad, Diocesis, Estado,
    EstadoPago, Gasto, Inscripcion, Pago, Pais, Parroquia, Participacion, Persona, Retiro, Rol,
    Tarea, TipoRetiro, Usuario,
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
        r = self.post("/api/inscripciones/", datos)
        self.assertEqual(r.json()["persona"], ["Ya está inscrita en este retiro."])
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
        aragua = Estado.objects.create(
            pais=Pais.objects.create(nombre="Venezuela", codigo="VE"), nombre="Aragua")
        ana.persona.fecha_nacimiento = date(1990, 3, 13)
        ana.persona.estado = aragua
        ana.persona.ciudad = Ciudad.objects.create(estado=aragua, nombre="Maracay")
        ana.persona.documento = "12345678"
        ana.persona.datos_sensibles = {"telefono_casa": "0243-5551234"}
        ana.persona.save()
        ana.salud_alimentacion = {"tratamiento": "Insulina", "regimen_alimenticio": "Sin sal",
                                  "requerimientos": "Silla de ruedas"}
        ana.contacto_emergencia = {"nombre": "Rosa", "relacion": "Madre", "telefono": "0412",
                                   "celular": "0424", "nombre2": "Juan", "telefono2": "0416"}
        ana.save()

        ficha = self.client.get(self.ruta).json()["caminantes"]["filas"][0]["ficha"]
        self.assertEqual(ficha["edad"], 36)  # cumple 37 el día después de empezar
        self.assertEqual(
            (ficha["procedencia"], ficha["documento"], ficha["telefono_casa"],
             ficha["tratamiento"], ficha["alimentacion"], ficha["requerimientos"]),
            ("Maracay, Aragua", "V-12345678", "0243-5551234", "Insulina", "Sin sal",
             "Silla de ruedas"),
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

    def test_el_rol_fija_parroquia_y_tipo_del_listado_de_retiros(self):
        samuel = TipoRetiro.objects.create(nombre="Samuel")
        otro = Retiro.objects.create(
            parroquia=self.parroquia, tipo=samuel, edicion=1,
            fecha_inicio=date(2027, 5, 1), fecha_fin=date(2027, 5, 3),
        )
        self.entrar_como(Rol.COORD_RETIRO)

        retiros = self.client.get("/api/retiros/").json()["results"]
        self.assertEqual([r["id"] for r in retiros], [str(self.retiro.pk)])
        # Pedir el otro tipo por la URL no lo muestra.
        r = self.client.get(f"/api/retiros/?tipo={samuel.pk}").json()
        self.assertEqual([x["id"] for x in r["results"]], [str(self.retiro.pk)])
        self.assertNotEqual(otro.pk, self.retiro.pk)

        (modulo,) = [m for m in self.client.get("/api/esquema/").json()
                     if m["slug"] == "retiros"]
        fijos = {f["nombre"]: f.get("fijo") for f in modulo["filtros"]}
        self.assertEqual(fijos["parroquia"],
                         {"valor": str(self.parroquia.pk), "etiqueta": "San José"})
        self.assertEqual(fijos["tipo"]["etiqueta"], "Emaús hombres")
        self.assertIsNone(fijos["estado"])

        # El inicio y el panel tampoco muestran el retiro del otro tipo.
        resumen = self.client.get("/api/resumen/").json()
        self.assertEqual([r["id"] for r in resumen["retiros_tablero"]], [str(self.retiro.pk)])
        self.assertEqual(self.client.get(f"/api/retiros/{otro.pk}/panel/").status_code, 404)

    def test_superusuario_no_tiene_filtros_fijos(self):
        (modulo,) = [m for m in self.client.get("/api/esquema/").json()
                     if m["slug"] == "retiros"]
        self.assertFalse(any("fijo" in f for f in modulo["filtros"]))

    def test_tamano_de_pagina(self):
        for n in range(3):
            self.persona(f"Persona {n}")
        r = self.client.get("/api/personas/?page_size=2").json()
        self.assertEqual((len(r["results"]), r["count"]), (2, 4))

    def test_usuario_inactivo_pierde_el_acceso(self):
        usuario = self.entrar_como(Rol.COORD_RETIRO)
        usuario.activo = False
        usuario.save()
        self.assertEqual(self.client.get(self.ruta).status_code, 403)


class DocumentoYGeografiaTests(Base):
    def crear(self, **datos):
        return self.post("/api/personas/", {
            "primer_nombre": "Ana", "primer_apellido": "Pérez",
            "parroquia": str(self.parroquia.pk), **datos,
        })

    def test_el_documento_se_normaliza_y_no_se_repite(self):
        r = self.crear(tipo_documento="V", documento="v-12.345.678")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Persona.objects.get().documento, "12345678")

        r = self.crear(tipo_documento="V", documento="12345678")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Ya está registrada con ese documento", r.json()["documento"][0])
        # El mismo número con otro tipo de documento es otra persona.
        self.assertEqual(self.crear(tipo_documento="E", documento="12345678").status_code, 201)

    def test_formato_del_documento(self):
        r = self.crear(tipo_documento="V", documento="12A45")
        self.assertIn("solo números", r.json()["documento"][0])
        r = self.crear(tipo_documento="P", documento="AB1")
        self.assertIn("pasaporte", r.json()["documento"][0])
        self.assertEqual(self.crear(tipo_documento="P", documento="ab123456").status_code, 201)

    def test_edad_minima_de_18(self):
        hoy = timezone.localdate()
        menor = hoy.replace(year=hoy.year - 17).isoformat()
        r = self.crear(fecha_nacimiento=menor)
        self.assertEqual(r.json()["fecha_nacimiento"], ["Debe tener al menos 18 años."])
        adulto = hoy.replace(year=hoy.year - 18, day=1).isoformat()
        self.assertEqual(self.crear(fecha_nacimiento=adulto).status_code, 201)

    def test_sembrar_geografia_no_duplica(self):
        call_command("sembrar_geografia", stdout=open("/dev/null", "w"))
        call_command("sembrar_geografia", stdout=open("/dev/null", "w"))
        venezuela = Pais.objects.get(codigo="VE")
        self.assertEqual(venezuela.estados.count(), 25)
        self.assertTrue(Ciudad.objects.filter(estado__nombre="Miranda", nombre="Los Teques")
                        .exists())
        self.assertEqual(Ciudad.objects.filter(nombre="Caracas").count(), 1)

    def test_la_ciudad_debe_ser_del_estado(self):
        call_command("sembrar_geografia", stdout=open("/dev/null", "w"))
        zulia = Estado.objects.get(nombre="Zulia")
        teques = Ciudad.objects.get(nombre="Los Teques")
        r = self.crear(estado=str(zulia.pk), ciudad=str(teques.pk))
        self.assertEqual(r.json()["ciudad"], ["Esa ciudad no es de ese estado."])

    def test_sembrar_areas_no_duplica(self):
        propia = AreaServicio.objects.create(parroquia=self.parroquia, nombre="Cocina")
        sin_descripcion = AreaServicio.objects.create(nombre="Música / Coro")
        call_command("sembrar_areas", stdout=open("/dev/null", "w"))
        call_command("sembrar_areas", stdout=open("/dev/null", "w"))
        generales = AreaServicio.objects.filter(parroquia=None)
        self.assertEqual(generales.count(), 11)
        self.assertIn("Santísimo", generales.get(nombre="Intercesión / Capilla").descripcion)
        sin_descripcion.refresh_from_db()
        self.assertIn("alabanza", sin_descripcion.descripcion)
        # El área propia de la parroquia no se toca.
        propia.refresh_from_db()
        self.assertEqual(propia.descripcion, "")

    def test_estados_y_ciudades_por_api(self):
        call_command("sembrar_geografia", stdout=open("/dev/null", "w"))
        venezuela = Pais.objects.get(codigo="VE")
        estados = self.client.get(f"/api/estados/?pais={venezuela.pk}&page_size=100").json()
        self.assertEqual(estados["count"], 25)
        miranda = next(e for e in estados["results"] if e["nombre"] == "Miranda")
        ciudades = self.client.get(f"/api/ciudades/?estado={miranda['id']}&page_size=100").json()
        self.assertIn("Los Teques", [c["nombre"] for c in ciudades["results"]])


class NombresYDuplicadosTests(Base):
    def crear(self, **datos):
        return self.post("/api/personas/", {"parroquia": str(self.parroquia.pk), **datos})

    def test_nombre_completo_con_nombres_y_apellidos(self):
        r = self.crear(primer_nombre=" María ", segundo_nombre="José",
                       primer_apellido="Pérez", segundo_apellido="Gómez",
                       nombre="Esto no se usa")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["nombre"], "María José Pérez Gómez")

    def test_pide_primer_nombre_y_primer_apellido(self):
        errores = self.crear(segundo_nombre="José").json()
        self.assertEqual(errores["primer_nombre"], ["Escribe el primer nombre."])
        self.assertEqual(errores["primer_apellido"], ["Escribe el primer apellido."])

    def test_nombres_viejos_se_reparten(self):
        casos = {
            "Ana Pérez": ("Ana", "", "Pérez", ""),
            "José Pérez Gómez": ("José", "", "Pérez", "Gómez"),
            "María José Pérez Gómez": ("María", "José", "Pérez", "Gómez"),
            "Ana María Luisa Pérez Gómez": ("Ana", "María Luisa", "Pérez", "Gómez"),
        }
        for completo, partes in casos.items():
            p = self.persona(completo)
            self.assertEqual((p.primer_nombre, p.segundo_nombre, p.primer_apellido,
                              p.segundo_apellido), partes, completo)
            self.assertEqual(p.nombre, completo)

    def test_no_duplica_por_nombre_y_fecha(self):
        datos = {"primer_nombre": "Ana", "primer_apellido": "Pérez",
                 "fecha_nacimiento": "1990-05-04"}
        self.assertEqual(self.crear(**datos).status_code, 201)
        r = self.crear(**{**datos, "primer_nombre": "ana"})
        self.assertIn("Ya hay una persona con ese nombre y fecha de nacimiento",
                      r.json()["primer_nombre"][0])
        # Aunque la nueva traiga documento, la anterior no tiene: podría ser
        # la misma persona.
        r = self.crear(**datos, documento="12345678")
        self.assertEqual(r.status_code, 400)

    def test_con_documentos_distintos_son_personas_distintas(self):
        datos = {"primer_nombre": "Ana", "primer_apellido": "Pérez",
                 "fecha_nacimiento": "1990-05-04"}
        self.assertEqual(self.crear(**datos, documento="12345678").status_code, 201)
        self.assertEqual(self.crear(**datos, documento="87654321").status_code, 201)

    def test_pasaporte_repetido(self):
        datos = {"primer_nombre": "John", "primer_apellido": "Smith",
                 "tipo_documento": "P", "documento": "AB123456"}
        self.assertEqual(self.crear(**datos).status_code, 201)
        r = self.crear(**{**datos, "primer_nombre": "Juan"})
        self.assertIn("Ya está registrada con ese documento", r.json()["documento"][0])

    def test_ciudad_escrita_si_no_esta_en_la_lista(self):
        colombia = Pais.objects.create(nombre="Colombia", codigo="CO")
        r = self.crear(primer_nombre="Ana", primer_apellido="Gómez", pais=str(colombia.pk),
                       estado_texto="Antioquia", ciudad_texto="Medellín")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Persona.objects.get().procedencia, "Medellín, Antioquia, Colombia")

    def test_caminante_y_servidor_del_mismo_retiro(self):
        ana, luis = self.persona("Ana Pérez"), self.persona("Luis Gómez")
        Inscripcion.objects.create(retiro=self.retiro, persona=ana)
        r = self.post("/api/participaciones/", {
            "retiro": str(self.retiro.pk), "persona": str(ana.pk), "tipo": "servidor"})
        self.assertEqual(r.json()["persona"], ["Está inscrita como caminante en este retiro."])

        Participacion.objects.create(retiro=self.retiro, persona=luis, tipo="servidor")
        r = self.post("/api/inscripciones/", {
            "retiro": str(self.retiro.pk), "persona": str(luis.pk)})
        self.assertEqual(r.json()["persona"],
                         ["Ya está en el equipo de este retiro como servidor."])
        r = self.post("/api/participaciones/", {
            "retiro": str(self.retiro.pk), "persona": str(luis.pk), "tipo": "coordinador"})
        self.assertEqual(r.json()["persona"], ["Ya está en este retiro como servidor."])

    def test_area_repetida(self):
        luis = Participacion.objects.create(
            retiro=self.retiro, persona=self.persona("Luis Gómez"), tipo="servidor")
        cocina = AreaServicio.objects.create(nombre="Cocina")
        datos = {"participacion": str(luis.pk), "area": str(cocina.pk)}
        self.assertEqual(self.post("/api/servicios/", datos).status_code, 201)
        self.assertEqual(self.post("/api/servicios/", datos).json()["area"],
                         ["Ya sirve en esa área."])


class PreferenciasTests(Base):
    def cambiar(self, **datos):
        return self.client.patch("/api/auth/preferencias/", datos,
                                 content_type="application/json")

    def test_sin_preferencias_usa_la_moneda_base(self):
        pref = self.client.get("/api/auth/sesion/").json()["preferencias"]
        self.assertEqual(pref, {"retiro": None, "moneda": "USD", "moneda_vista": "USD",
                                "factor": 1, "aviso": ""})

    def test_elegir_edicion_y_moneda(self):
        r = self.cambiar(retiro=str(self.retiro.pk), moneda="VES")
        self.assertEqual(r.status_code, 200, r.content)
        pref = r.json()["preferencias"]
        self.assertEqual(pref["retiro"], {"id": str(self.retiro.pk),
                                          "etiqueta": "Emaús hombres #12"})
        # 180 Bs por dólar (el BCV de prueba): un monto en USD se ve x180.
        self.assertEqual((pref["moneda_vista"], pref["factor"]), ("VES", 180.0))
        self.assertEqual(self.cambiar(moneda="EUR").json()["preferencias"]["factor"], 0.9)
        # Cambiar una no borra la otra.
        self.assertEqual(self.client.get("/api/auth/sesion/").json()["preferencias"]
                         ["retiro"]["id"], str(self.retiro.pk))

    def test_columna_de_equivalente_en_la_moneda_elegida(self):
        self.cambiar(moneda="VES")
        (pagos,) = [m for m in self.client.get("/api/esquema/").json() if m["slug"] == "pagos"]
        columna = next(c for c in pagos["lista"] if c["nombre"] == "monto_base")
        self.assertEqual(columna["etiqueta"], "Equivalente en VES")

    def test_sin_tasa_se_ve_en_la_moneda_base(self):
        self.bcv.side_effect = OSError("sin red")
        cache.clear()
        pref = self.cambiar(moneda="VES").json()["preferencias"]
        self.assertEqual((pref["moneda"], pref["moneda_vista"], pref["factor"]),
                         ("VES", "USD", 1))
        self.assertIn("No se pudo consultar la tasa", pref["aviso"])

    def test_valida_lo_que_se_elige(self):
        self.assertEqual(self.cambiar(moneda="MXN").status_code, 400)
        self.assertEqual(
            self.cambiar(retiro="00000000-0000-0000-0000-000000000000").status_code, 400)

    def test_el_tablero_abre_la_edicion_preferida(self):
        otro = Retiro.objects.create(
            parroquia=self.parroquia, tipo=self.retiro.tipo, edicion=13,
            fecha_inicio=date(2027, 1, 10), fecha_fin=date(2027, 1, 12),
        )
        # Sin preferencia: el próximo (el 13, que empieza antes).
        self.assertEqual(self.client.get("/api/resumen/").json()["tablero"]["retiro"]["id"],
                         str(otro.pk))
        self.cambiar(retiro=str(self.retiro.pk))
        self.assertEqual(self.client.get("/api/resumen/").json()["tablero"]["retiro"]["id"],
                         str(self.retiro.pk))

    def test_una_edicion_fuera_del_rol_no_se_puede_elegir(self):
        samuel = Retiro.objects.create(
            parroquia=self.parroquia, tipo=TipoRetiro.objects.create(nombre="Samuel"),
            edicion=1, fecha_inicio=date(2027, 5, 1), fecha_fin=date(2027, 5, 3),
        )
        cuenta = User.objects.create_user("coord", password="x")
        usuario = Usuario.objects.create(persona=self.persona("Coord Uno"), cuenta=cuenta)
        AsignacionRol.objects.create(usuario=usuario, rol=Rol.COORD_RETIRO, retiro=self.retiro)
        self.client.force_login(cuenta)
        self.assertEqual(self.cambiar(retiro=str(samuel.pk)).status_code, 400)
        self.assertEqual(self.cambiar(retiro=str(self.retiro.pk)).status_code, 200)


class FichaYServidoresTests(Base):
    def setUp(self):
        super().setUp()
        self.ana = self.persona("Ana Pérez", fecha_nacimiento=date(1990, 1, 1))
        self.luis = self.persona("Luis Gómez")
        anterior = Retiro.objects.create(
            parroquia=self.parroquia, tipo=self.retiro.tipo, edicion=11,
            fecha_inicio=date(2026, 3, 6), fecha_fin=date(2026, 3, 8), cuota=50,
            cuota_servidor=20,
        )
        # Ana fue caminante en la 11 (invitada por Luis) y sirve en la 12.
        ins = Inscripcion.objects.create(retiro=anterior, persona=self.ana, padrino=self.luis,
                                         estado=Inscripcion.Estado.CONFIRMADA)
        Pago.objects.create(retiro=anterior, inscripcion=ins, monto=50, concepto="cuota",
                            fecha=date(2026, 3, 1))
        servidora = Participacion.objects.create(retiro=self.retiro, persona=self.ana,
                                                 tipo="servidor")
        cocina = AreaServicio.objects.create(nombre="Cocina")
        musica = AreaServicio.objects.create(nombre="Música")
        AsignacionServicio.objects.create(participacion=servidora, area=cocina,
                                          es_coordinador=True)
        AsignacionServicio.objects.create(participacion=servidora, area=musica)
        # Una participación de caminante no es del equipo.
        Participacion.objects.create(retiro=anterior, persona=self.luis, tipo="caminante")
        Tarea.objects.create(retiro=self.retiro, titulo="Comprar café", responsable=self.ana)

    def test_ficha_junta_todo_lo_de_la_persona(self):
        ficha = self.client.get(f"/api/personas/{self.ana.pk}/ficha/").json()
        self.assertEqual(ficha["persona"]["nombre"], "Ana Pérez")
        self.assertIsNotNone(ficha["persona"]["edad"])
        (caminante,) = ficha["caminante"]
        self.assertEqual((caminante["retiro"]["etiqueta"], caminante["estado"],
                          caminante["padrino"], caminante["estado_pago"]),
                         ("Emaús hombres #11", "confirmada", "Luis Gómez", "pagado"))
        (servidor,) = ficha["servidor"]
        self.assertEqual(servidor["retiro"]["etiqueta"], "Emaús hombres #12")
        self.assertEqual([(a["nombre"], a["es_coordinador"]) for a in servidor["areas"]],
                         [("Cocina", True), ("Música", False)])
        self.assertEqual([t["titulo"] for t in ficha["tareas"]], ["Comprar café"])
        self.assertIsNone(ficha["acceso"])  # no tiene usuario

        luis = self.client.get(f"/api/personas/{self.luis.pk}/ficha/").json()
        self.assertEqual([i["nombre"] for i in luis["invito"]], ["Ana Pérez"])
        self.assertEqual(luis["servidor"], [])  # ser caminante no es servir

    def test_ficha_con_usuario_y_roles(self):
        usuario = Usuario.objects.create(
            persona=self.ana, cuenta=User.objects.create_user("ana", password="x"))
        AsignacionRol.objects.create(usuario=usuario, rol=Rol.LOGISTICA, retiro=self.retiro)
        acceso = self.client.get(f"/api/personas/{self.ana.pk}/ficha/").json()["acceso"]
        self.assertEqual(acceso["usuario"], "ana")
        self.assertEqual(acceso["roles"], [{"rol": "logistica",
                                            "rol_display": "Coordinador de logística",
                                            "ambito": "Emaús hombres #12"}])

    def test_ficha_respeta_permisos(self):
        user = User.objects.create_user("lector", password="x")
        user.user_permissions.add(Permission.objects.get(codename="view_persona"))
        self.client.force_login(user)
        ficha = self.client.get(f"/api/personas/{self.ana.pk}/ficha/").json()
        self.assertIsNone(ficha["caminante"])
        self.assertIsNone(ficha["servidor"])
        self.assertNotIn("acceso", ficha)
        self.assertNotIn("datos_sensibles", ficha["persona"])
        user.user_permissions.clear()
        self.assertEqual(
            self.client.get(f"/api/personas/{self.ana.pk}/ficha/").status_code, 403)

    def test_servidores_con_sus_areas_y_sin_caminantes(self):
        filas = self.client.get("/api/participaciones/").json()["results"]
        self.assertEqual([(f["persona_etiqueta"], f["areas"]) for f in filas],
                         [("Ana Pérez", "Cocina (coordina), Música")])
        buscadas = self.client.get("/api/participaciones/?search=Música").json()["results"]
        self.assertEqual(len(buscadas), 1)

    def test_menu_por_grupos(self):
        modulos = {m["slug"]: m for m in self.client.get("/api/esquema/").json()}
        self.assertEqual(
            [s for s, m in modulos.items() if m["grupo"] == "Personas"],
            ["personas", "inscripciones", "participaciones", "servicios", "usuarios", "roles"])
        self.assertEqual((modulos["inscripciones"]["titulo"],
                          modulos["participaciones"]["titulo"]), ("Caminantes", "Servidores"))
        self.assertFalse(modulos["servicios"]["en_menu"])
        tipo = next(f for f in modulos["participaciones"]["filtros"] if f["nombre"] == "tipo")
        self.assertEqual([o["valor"] for o in tipo["opciones"]], ["servidor", "coordinador"])


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

    def test_importar_casa_por_documento(self):
        self.persona("Ana Pérez", documento="12345678")
        datos = tablib.Dataset(
            ["V", "V-12.345.678", "Ana María Pérez", "San José"],
            headers=["tipo_documento", "documento", "nombre", "parroquia"],
        )
        PersonaResource().import_data(datos, raise_errors=True)
        self.assertEqual(Persona.objects.get().nombre, "Ana María Pérez")

    def test_exportar_personas_omite_datos_sensibles(self):
        self.persona("Ana", datos_sensibles={"direccion": "Calle 1"})
        exportado = PersonaResource().export()
        self.assertEqual(exportado.headers,
                         ["tipo_documento", "documento", "nombre", "primer_nombre",
                          "segundo_nombre", "primer_apellido", "segundo_apellido", "telefono",
                          "email", "fecha_nacimiento", "parroquia"])
        self.assertEqual(exportado[0][10], "San José")
