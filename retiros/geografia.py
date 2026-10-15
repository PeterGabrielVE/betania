"""
Datos para `manage.py sembrar_geografia`: países y, de Venezuela, sus estados
(entidades federales) con sus ciudades principales. Para agregar una ciudad o un
país basta con sumarlo aquí y volver a correr el comando (no duplica nada).
"""

VENEZUELA = "VE"

# (código ISO 3166-1 alfa-2, nombre). Venezuela y los países de donde más suelen
# venir caminantes; se pueden agregar más.
PAISES = [
    ("VE", "Venezuela"),
    ("AR", "Argentina"),
    ("AW", "Aruba"),
    ("BO", "Bolivia"),
    ("BR", "Brasil"),
    ("CA", "Canadá"),
    ("CL", "Chile"),
    ("CN", "China"),
    ("CO", "Colombia"),
    ("CR", "Costa Rica"),
    ("CU", "Cuba"),
    ("CW", "Curazao"),
    ("DE", "Alemania"),
    ("DO", "República Dominicana"),
    ("EC", "Ecuador"),
    ("ES", "España"),
    ("FR", "Francia"),
    ("GB", "Reino Unido"),
    ("GT", "Guatemala"),
    ("GY", "Guyana"),
    ("HN", "Honduras"),
    ("HT", "Haití"),
    ("IT", "Italia"),
    ("LB", "Líbano"),
    ("MX", "México"),
    ("NI", "Nicaragua"),
    ("PA", "Panamá"),
    ("PE", "Perú"),
    ("PR", "Puerto Rico"),
    ("PT", "Portugal"),
    ("PY", "Paraguay"),
    ("SV", "El Salvador"),
    ("SY", "Siria"),
    ("TT", "Trinidad y Tobago"),
    ("US", "Estados Unidos"),
    ("UY", "Uruguay"),
]

# Las 23 entidades federales con nombre de estado, el Distrito Capital y las
# Dependencias Federales, cada una con su capital primero.
ESTADOS_VENEZUELA = {
    "Amazonas": [
        "Puerto Ayacucho", "Isla Ratón", "La Esmeralda", "Maroa",
        "San Carlos de Río Negro", "San Fernando de Atabapo", "San Juan de Manapiare",
    ],
    "Anzoátegui": [
        "Barcelona", "Anaco", "Aragua de Barcelona", "Cantaura", "Clarines",
        "El Tigre", "Guanta", "Lechería", "Onoto", "Pariaguán", "Puerto La Cruz",
        "Puerto Píritu", "San Tomé", "Soledad",
    ],
    "Apure": [
        "San Fernando de Apure", "Achaguas", "Biruaca", "Bruzual", "Elorza",
        "Guasdualito", "Mantecal",
    ],
    "Aragua": [
        "Maracay", "Cagua", "Colonia Tovar", "El Consejo", "El Limón",
        "La Victoria", "Las Tejerías", "Ocumare de la Costa", "Palo Negro",
        "San Mateo", "San Sebastián", "Santa Cruz", "Santa Rita", "Turmero",
        "Villa de Cura",
    ],
    "Barinas": [
        "Barinas", "Arismendi", "Barinitas", "Barrancas", "Ciudad Bolivia",
        "Libertad", "Obispos", "Sabaneta", "Santa Bárbara", "Socopó",
    ],
    "Bolívar": [
        "Ciudad Bolívar", "Caicara del Orinoco", "Ciudad Guayana", "Ciudad Piar",
        "El Callao", "El Palmar", "Guasipati", "Maripa", "Puerto Ordaz",
        "San Félix", "Santa Elena de Uairén", "Tumeremo", "Upata",
    ],
    "Carabobo": [
        "Valencia", "Bejuma", "Guacara", "Güigüe", "Los Guayos", "Mariara",
        "Miranda", "Montalbán", "Morón", "Naguanagua", "Puerto Cabello",
        "San Diego", "San Joaquín", "Tacarigua", "Tocuyito",
    ],
    "Cojedes": [
        "San Carlos", "El Baúl", "El Pao", "Las Vegas", "Macapo", "Tinaco",
        "Tinaquillo",
    ],
    "Delta Amacuro": ["Tucupita", "Curiapo", "Pedernales", "Sierra Imataca"],
    "Distrito Capital": ["Caracas"],
    "Falcón": [
        "Coro", "Chichiriviche", "Churuguara", "Dabajuro", "Judibana",
        "La Vela de Coro", "Mene de Mauroa", "Mirimire", "Pueblo Nuevo",
        "Puerto Cumarebo", "Punto Fijo", "Santa Cruz de Bucaral", "Tocópero",
        "Tucacas",
    ],
    "Guárico": [
        "San Juan de los Morros", "Altagracia de Orituco", "Calabozo", "Camaguán",
        "Chaguaramas", "El Sombrero", "Las Mercedes", "Ortiz",
        "Santa María de Ipire", "Tucupido", "Valle de la Pascua", "Zaraza",
    ],
    "La Guaira": [
        "La Guaira", "Caraballeda", "Carayaca", "Catia La Mar", "Macuto",
        "Maiquetía", "Naiguatá",
    ],
    "Lara": [
        "Barquisimeto", "Cabudare", "Carora", "Duaca", "El Tocuyo", "Quíbor",
        "Río Tocuyo", "Sanare", "Sarare", "Siquisique",
    ],
    "Mérida": [
        "Mérida", "Bailadores", "Ejido", "El Vigía", "Lagunillas", "Mucuchíes",
        "Nueva Bolivia", "Santa Cruz de Mora", "Santo Domingo", "Tabay",
        "Timotes", "Tovar", "Zea",
    ],
    "Miranda": [
        "Los Teques", "Baruta", "Carrizal", "Caucagua", "Chacao", "Charallave",
        "Cúa", "El Hatillo", "Guarenas", "Guatire", "Higuerote",
        "Ocumare del Tuy", "Paracotos", "Petare", "Río Chico",
        "San Antonio de los Altos", "San Francisco de Yare", "Santa Lucía",
        "Santa Teresa del Tuy",
    ],
    "Monagas": [
        "Maturín", "Aragua de Maturín", "Barrancas del Orinoco",
        "Caicara de Maturín", "Caripe", "Caripito", "Punta de Mata",
        "Quiriquire", "Santa Bárbara", "Temblador",
    ],
    "Nueva Esparta": [
        "La Asunción", "Boca de Río", "El Valle del Espíritu Santo",
        "Juan Griego", "Pampatar", "Porlamar", "Punta de Piedras",
        "San Juan Bautista", "Santa Ana", "Villa Rosa",
    ],
    "Portuguesa": [
        "Guanare", "Acarigua", "Agua Blanca", "Araure", "Biscucuy", "Chabasquén",
        "Guanarito", "Ospino", "Píritu", "Turén", "Villa Bruzual",
    ],
    "Sucre": [
        "Cumaná", "Araya", "Cariaco", "Carúpano", "Casanay", "Cumanacoa",
        "Güiria", "Irapa", "Marigüitar", "Río Caribe", "Tunapuy", "Yaguaraparo",
    ],
    "Táchira": [
        "San Cristóbal", "Capacho", "Colón", "Cordero", "La Fría", "La Grita",
        "Lobatera", "Michelena", "Palmira", "Queniquea", "Rubio",
        "San Antonio del Táchira", "Santa Ana", "Táriba", "Ureña",
    ],
    "Trujillo": [
        "Trujillo", "Betijoque", "Boconó", "Carache", "Escuque", "Monay",
        "Motatán", "Pampán", "Sabana de Mendoza", "Santa Ana", "Valera",
    ],
    "Yaracuy": [
        "San Felipe", "Aroa", "Chivacoa", "Cocorote", "Farriar", "Guama",
        "Independencia", "Nirgua", "Sabana de Parra", "Urachiche", "Yaritagua",
    ],
    "Zulia": [
        "Maracaibo", "Bachaquero", "Cabimas", "Caja Seca", "Ciudad Ojeda",
        "El Moján", "Encontrados", "La Concepción", "Lagunillas",
        "Los Puertos de Altagracia", "Machiques", "Mene Grande", "San Carlos del Zulia",
        "San Francisco", "Santa Bárbara del Zulia", "Santa Rita", "Sinamaica",
        "Villa del Rosario",
    ],
    "Dependencias Federales": ["Los Roques"],
}
