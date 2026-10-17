-- ============================================================================
-- Row-Level Security (idempotente: se puede reejecutar sin error).
-- Diócesis -> Parroquia -> (Personas, Retiros). La PARROQUIA es el inquilino.
-- La app fija por petición (retiros/middleware.py): app.rol (nivel: super_admin,
-- admin_diocesano o el código del rol), app.parroquia_id, app.diocesis_id,
-- app.finanzas y app.sensibles ('1' según los permisos de sus roles).
-- ============================================================================

CREATE OR REPLACE FUNCTION app_parroquia() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.parroquia_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_diocesis() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.diocesis_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_rol() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.rol', true) $$;

-- Los roles se definen en la app (pantalla Roles y permisos): aquí solo se lee
-- lo que la app calculó de ellos.
CREATE OR REPLACE FUNCTION rol_finanzas() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app_rol() = 'super_admin' OR current_setting('app.finanzas', true) = '1';
  $$;
CREATE OR REPLACE FUNCTION rol_datos_sensibles() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app_rol() = 'super_admin' OR current_setting('app.sensibles', true) = '1';
  $$;
CREATE OR REPLACE FUNCTION parroquia_visible(pid uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app_rol() = 'super_admin'
        OR pid = app_parroquia()
        OR (app_rol() = 'admin_diocesano'
            AND EXISTS (SELECT 1 FROM retiros_parroquia p
                        WHERE p.id = pid AND p.diocesis_id = app_diocesis()));
  $$;

-- PERSONA
ALTER TABLE retiros_persona ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_persona FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS persona_tenant ON retiros_persona;
CREATE POLICY persona_tenant ON retiros_persona
  USING (parroquia_visible(parroquia_id));

-- FOTO DE PERFIL: la ve quien ve a la persona.
ALTER TABLE retiros_fotopersona ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_fotopersona FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fotopersona_tenant ON retiros_fotopersona;
CREATE POLICY fotopersona_tenant ON retiros_fotopersona
  USING (EXISTS (SELECT 1 FROM retiros_persona p
                 WHERE p.id = persona_id AND parroquia_visible(p.parroquia_id)));

-- RETIRO
ALTER TABLE retiros_retiro ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_retiro FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retiro_tenant ON retiros_retiro;
CREATE POLICY retiro_tenant ON retiros_retiro
  USING (parroquia_visible(parroquia_id));

-- Tablas colgadas de un retiro
ALTER TABLE retiros_inscripcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_inscripcion FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inscripcion_tenant ON retiros_inscripcion;
CREATE POLICY inscripcion_tenant ON retiros_inscripcion
  USING (EXISTS (SELECT 1 FROM retiros_retiro r
                 WHERE r.id = retiro_id AND parroquia_visible(r.parroquia_id)));

ALTER TABLE retiros_participacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_participacion FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS participacion_tenant ON retiros_participacion;
CREATE POLICY participacion_tenant ON retiros_participacion
  USING (EXISTS (SELECT 1 FROM retiros_retiro r
                 WHERE r.id = retiro_id AND parroquia_visible(r.parroquia_id)));

ALTER TABLE retiros_charla ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_charla FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS charla_tenant ON retiros_charla;
CREATE POLICY charla_tenant ON retiros_charla
  USING (EXISTS (SELECT 1 FROM retiros_retiro r
                 WHERE r.id = retiro_id AND parroquia_visible(r.parroquia_id)));

ALTER TABLE retiros_tarea ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_tarea FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tarea_tenant ON retiros_tarea;
CREATE POLICY tarea_tenant ON retiros_tarea
  USING (EXISTS (SELECT 1 FROM retiros_retiro r
                 WHERE r.id = retiro_id AND parroquia_visible(r.parroquia_id)));

ALTER TABLE retiros_asignacionservicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_asignacionservicio FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asignacion_tenant ON retiros_asignacionservicio;
CREATE POLICY asignacion_tenant ON retiros_asignacionservicio
  USING (EXISTS (SELECT 1 FROM retiros_participacion p
                 JOIN retiros_retiro r ON r.id = p.retiro_id
                 WHERE p.id = participacion_id AND parroquia_visible(r.parroquia_id)));

-- FINANZAS: tenant + solo roles financieros
ALTER TABLE retiros_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_pago FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pago_tenant_rol ON retiros_pago;
CREATE POLICY pago_tenant_rol ON retiros_pago
  USING (rol_finanzas()
         AND EXISTS (SELECT 1 FROM retiros_retiro r
                     WHERE r.id = retiro_id AND parroquia_visible(r.parroquia_id)));

ALTER TABLE retiros_gasto ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_gasto FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gasto_tenant_rol ON retiros_gasto;
CREATE POLICY gasto_tenant_rol ON retiros_gasto
  USING (rol_finanzas()
         AND EXISTS (SELECT 1 FROM retiros_retiro r
                     WHERE r.id = retiro_id AND parroquia_visible(r.parroquia_id)));

-- Confidencialidad por columna (salud, contacto de emergencia)
CREATE OR REPLACE VIEW inscripcion_equipo WITH (security_barrier) AS
SELECT
  i.id, i.retiro_id, i.persona_id, i.padrino_id, i.estado, i.consentimiento_datos, i.creado,
  CASE WHEN rol_datos_sensibles() THEN i.salud_alimentacion  ELSE NULL END AS salud_alimentacion,
  CASE WHEN rol_datos_sensibles() THEN i.contacto_emergencia ELSE NULL END AS contacto_emergencia
FROM retiros_inscripcion i;

-- AUDITORÍA: solo se inserta y se lee (sin políticas de UPDATE ni DELETE, nadie
-- la cambia ni la borra). Cada quien lee lo de las parroquias que ve; lo que no
-- es de una parroquia (roles, catálogos, ingresos de cuentas sin persona), solo
-- el super administrador.
ALTER TABLE retiros_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_auditoria FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auditoria_leer ON retiros_auditoria;
CREATE POLICY auditoria_leer ON retiros_auditoria FOR SELECT
  USING (app_rol() = 'super_admin'
         OR (parroquia_id IS NOT NULL AND parroquia_visible(parroquia_id)));
DROP POLICY IF EXISTS auditoria_insertar ON retiros_auditoria;
CREATE POLICY auditoria_insertar ON retiros_auditoria FOR INSERT WITH CHECK (true);
