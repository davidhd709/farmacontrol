/**
 * Catálogo oficial DIVIPOLA (Codificación de la División Político-Administrativa de Colombia) — DANE.
 *
 * Fuente oficial:
 *   Departamento Administrativo Nacional de Estadística (DANE)
 *   https://www.dane.gov.co/index.php/sistema-estadistico-nacional-sen/normas-y-estandares/nomenclaturas-y-clasificaciones/nomenclaturas/codificacion-de-la-division-politica-administrativa-de-colombia-divipola
 *   Dataset oficial DANE Datos Abiertos: gdxc-w37w ("DIVIPOLA- Códigos municipios")
 *
 * Versión y fechas del conjunto de datos DANE (gdxc-w37w):
 *   - Corte territorial descrito en el dataset: 2024-12-30 (30 de diciembre de 2024)
 *   - Última actualización de datos (filas): 2025-01-24 (24 de enero de 2025)
 *   - Última actualización de metadatos del portal: 2026-09-24 (24 de septiembre de 2026;
 *     corresponde únicamente a revisión administrativa de metadatos, sin cambios en los registros)
 *   - Fecha de consulta e integración local: 2026-11-08
 *   - Cobertura completa: 33 entidades departamentales (32 departamentos + Bogotá, D. C.)
 *     y 1.122 municipios / islas / áreas no municipalizadas.
 *   - Todos los códigos DIVIPOLA se conservan como cadenas de texto (2 dígitos para departamento,
 *     5 dígitos para municipio) para preservar los ceros iniciales (ej. '05', '05001').
 */

export const DIVIPOLA_CATALOG_METADATA = {
  source:
    'Departamento Administrativo Nacional de Estadística (DANE) — Codificación de la División Político-Administrativa de Colombia (DIVIPOLA)',
  referenceUrl:
    'https://www.dane.gov.co/index.php/sistema-estadistico-nacional-sen/normas-y-estandares/nomenclaturas-y-clasificaciones/nomenclaturas/codificacion-de-la-division-politica-administrativa-de-colombia-divipola',
  datasetId: 'gdxc-w37w',
  version: 'DIVIPOLA DANE (corte 2024-12-30; última actualización de datos 2025-01-24)',
  dataCutoffDate: '2024-12-30',
  dataUpdatedAt: '2025-01-24',
  metadataUpdatedAt: '2026-09-24',
  consultedAt: '2026-11-08',
  totalDepartments: 33,
  totalMunicipalities: 1122,
} as const;

export interface DivipolaDepartment {
  /** Código DANE del departamento (2 dígitos con cero inicial, ej. '05', '23', '70') */
  code: string;
  /** Nombre oficial con ortografía y tildes (ej. 'Antioquia', 'Bogotá, D. C.', 'Córdoba', 'Sucre') */
  name: string;
}

export interface DivipolaMunicipality {
  /** Código DANE del municipio (5 dígitos con cero inicial, ej. '05001', '23001', '70001') */
  code: string;
  /** Código DANE del departamento (2 dígitos con cero inicial, ej. '05', '23', '70') */
  departmentCode: string;
  /** Nombre oficial del departamento al que pertenece */
  departmentName: string;
  /** Nombre oficial del municipio o área no municipalizada con tildes */
  name: string;
  /** Categoría territorial DANE ('Municipio' | 'Isla' | 'Área no municipalizada') */
  type: string;
}

export const DIVIPOLA_DEPARTMENTS: readonly DivipolaDepartment[] = [
  {
    "code": "91",
    "name": "Amazonas"
  },
  {
    "code": "05",
    "name": "Antioquia"
  },
  {
    "code": "81",
    "name": "Arauca"
  },
  {
    "code": "88",
    "name": "Archipiélago de San Andrés, Providencia y Santa Catalina"
  },
  {
    "code": "08",
    "name": "Atlántico"
  },
  {
    "code": "11",
    "name": "Bogotá, D. C."
  },
  {
    "code": "13",
    "name": "Bolívar"
  },
  {
    "code": "15",
    "name": "Boyacá"
  },
  {
    "code": "17",
    "name": "Caldas"
  },
  {
    "code": "18",
    "name": "Caquetá"
  },
  {
    "code": "85",
    "name": "Casanare"
  },
  {
    "code": "19",
    "name": "Cauca"
  },
  {
    "code": "20",
    "name": "Cesar"
  },
  {
    "code": "27",
    "name": "Chocó"
  },
  {
    "code": "23",
    "name": "Córdoba"
  },
  {
    "code": "25",
    "name": "Cundinamarca"
  },
  {
    "code": "94",
    "name": "Guainía"
  },
  {
    "code": "95",
    "name": "Guaviare"
  },
  {
    "code": "41",
    "name": "Huila"
  },
  {
    "code": "44",
    "name": "La Guajira"
  },
  {
    "code": "47",
    "name": "Magdalena"
  },
  {
    "code": "50",
    "name": "Meta"
  },
  {
    "code": "52",
    "name": "Nariño"
  },
  {
    "code": "54",
    "name": "Norte de Santander"
  },
  {
    "code": "86",
    "name": "Putumayo"
  },
  {
    "code": "63",
    "name": "Quindío"
  },
  {
    "code": "66",
    "name": "Risaralda"
  },
  {
    "code": "68",
    "name": "Santander"
  },
  {
    "code": "70",
    "name": "Sucre"
  },
  {
    "code": "73",
    "name": "Tolima"
  },
  {
    "code": "76",
    "name": "Valle del Cauca"
  },
  {
    "code": "97",
    "name": "Vaupés"
  },
  {
    "code": "99",
    "name": "Vichada"
  }
];

type RawMunicipalityTuple = readonly [
  code: string,
  departmentCode: string,
  name: string,
  type: string,
];

const RAW_MUNICIPALITIES: readonly RawMunicipalityTuple[] = [["91263","91","El Encanto","Área no municipalizada"],["91405","91","La Chorrera","Área no municipalizada"],["91407","91","La Pedrera","Área no municipalizada"],["91430","91","La Victoria","Área no municipalizada"],["91001","91","Leticia","Municipio"],["91460","91","Mirití - Paraná","Área no municipalizada"],["91530","91","Puerto Alegría","Área no municipalizada"],["91536","91","Puerto Arica","Área no municipalizada"],["91540","91","Puerto Nariño","Municipio"],["91669","91","Puerto Santander","Área no municipalizada"],["91798","91","Tarapacá","Área no municipalizada"],["05002","05","Abejorral","Municipio"],["05004","05","Abriaquí","Municipio"],["05021","05","Alejandría","Municipio"],["05030","05","Amagá","Municipio"],["05031","05","Amalfi","Municipio"],["05034","05","Andes","Municipio"],["05036","05","Angelópolis","Municipio"],["05038","05","Angostura","Municipio"],["05040","05","Anorí","Municipio"],["05044","05","Anzá","Municipio"],["05045","05","Apartadó","Municipio"],["05051","05","Arboletes","Municipio"],["05055","05","Argelia","Municipio"],["05059","05","Armenia","Municipio"],["05079","05","Barbosa","Municipio"],["05088","05","Bello","Municipio"],["05086","05","Belmira","Municipio"],["05091","05","Betania","Municipio"],["05093","05","Betulia","Municipio"],["05107","05","Briceño","Municipio"],["05113","05","Buriticá","Municipio"],["05120","05","Cáceres","Municipio"],["05125","05","Caicedo","Municipio"],["05129","05","Caldas","Municipio"],["05134","05","Campamento","Municipio"],["05138","05","Cañasgordas","Municipio"],["05142","05","Caracolí","Municipio"],["05145","05","Caramanta","Municipio"],["05147","05","Carepa","Municipio"],["05150","05","Carolina","Municipio"],["05154","05","Caucasia","Municipio"],["05172","05","Chigorodó","Municipio"],["05190","05","Cisneros","Municipio"],["05101","05","Ciudad Bolívar","Municipio"],["05197","05","Cocorná","Municipio"],["05206","05","Concepción","Municipio"],["05209","05","Concordia","Municipio"],["05212","05","Copacabana","Municipio"],["05234","05","Dabeiba","Municipio"],["05237","05","Donmatías","Municipio"],["05240","05","Ebéjico","Municipio"],["05250","05","El Bagre","Municipio"],["05148","05","El Carmen de Viboral","Municipio"],["05697","05","El Santuario","Municipio"],["05264","05","Entrerríos","Municipio"],["05266","05","Envigado","Municipio"],["05282","05","Fredonia","Municipio"],["05284","05","Frontino","Municipio"],["05306","05","Giraldo","Municipio"],["05308","05","Girardota","Municipio"],["05310","05","Gómez Plata","Municipio"],["05313","05","Granada","Municipio"],["05315","05","Guadalupe","Municipio"],["05318","05","Guarne","Municipio"],["05321","05","Guatapé","Municipio"],["05347","05","Heliconia","Municipio"],["05353","05","Hispania","Municipio"],["05360","05","Itagüí","Municipio"],["05361","05","Ituango","Municipio"],["05364","05","Jardín","Municipio"],["05368","05","Jericó","Municipio"],["05376","05","La Ceja","Municipio"],["05380","05","La Estrella","Municipio"],["05390","05","La Pintada","Municipio"],["05400","05","La Unión","Municipio"],["05411","05","Liborina","Municipio"],["05425","05","Maceo","Municipio"],["05440","05","Marinilla","Municipio"],["05001","05","Medellín","Municipio"],["05467","05","Montebello","Municipio"],["05475","05","Murindó","Municipio"],["05480","05","Mutatá","Municipio"],["05483","05","Nariño","Municipio"],["05495","05","Nechí","Municipio"],["05490","05","Necoclí","Municipio"],["05501","05","Olaya","Municipio"],["05541","05","Peñol","Municipio"],["05543","05","Peque","Municipio"],["05576","05","Pueblorrico","Municipio"],["05579","05","Puerto Berrío","Municipio"],["05585","05","Puerto Nare","Municipio"],["05591","05","Puerto Triunfo","Municipio"],["05604","05","Remedios","Municipio"],["05607","05","Retiro","Municipio"],["05615","05","Rionegro","Municipio"],["05628","05","Sabanalarga","Municipio"],["05631","05","Sabaneta","Municipio"],["05642","05","Salgar","Municipio"],["05647","05","San Andrés de Cuerquía","Municipio"],["05649","05","San Carlos","Municipio"],["05652","05","San Francisco","Municipio"],["05656","05","San Jerónimo","Municipio"],["05658","05","San José de la Montaña","Municipio"],["05659","05","San Juan de Urabá","Municipio"],["05660","05","San Luis","Municipio"],["05664","05","San Pedro de los Milagros","Municipio"],["05665","05","San Pedro de Urabá","Municipio"],["05667","05","San Rafael","Municipio"],["05670","05","San Roque","Municipio"],["05674","05","San Vicente Ferrer","Municipio"],["05679","05","Santa Bárbara","Municipio"],["05042","05","Santa Fé de Antioquia","Municipio"],["05686","05","Santa Rosa de Osos","Municipio"],["05690","05","Santo Domingo","Municipio"],["05736","05","Segovia","Municipio"],["05756","05","Sonsón","Municipio"],["05761","05","Sopetrán","Municipio"],["05789","05","Támesis","Municipio"],["05790","05","Tarazá","Municipio"],["05792","05","Tarso","Municipio"],["05809","05","Titiribí","Municipio"],["05819","05","Toledo","Municipio"],["05837","05","Turbo","Municipio"],["05842","05","Uramita","Municipio"],["05847","05","Urrao","Municipio"],["05854","05","Valdivia","Municipio"],["05856","05","Valparaíso","Municipio"],["05858","05","Vegachí","Municipio"],["05861","05","Venecia","Municipio"],["05873","05","Vigía del Fuerte","Municipio"],["05885","05","Yalí","Municipio"],["05887","05","Yarumal","Municipio"],["05890","05","Yolombó","Municipio"],["05893","05","Yondó","Municipio"],["05895","05","Zaragoza","Municipio"],["81001","81","Arauca","Municipio"],["81065","81","Arauquita","Municipio"],["81220","81","Cravo Norte","Municipio"],["81300","81","Fortul","Municipio"],["81591","81","Puerto Rondón","Municipio"],["81736","81","Saravena","Municipio"],["81794","81","Tame","Municipio"],["88564","88","Providencia","Municipio"],["88001","88","San Andrés","Isla"],["08078","08","Baranoa","Municipio"],["08001","08","Barranquilla","Municipio"],["08137","08","Campo de la Cruz","Municipio"],["08141","08","Candelaria","Municipio"],["08296","08","Galapa","Municipio"],["08372","08","Juan de Acosta","Municipio"],["08421","08","Luruaco","Municipio"],["08433","08","Malambo","Municipio"],["08436","08","Manatí","Municipio"],["08520","08","Palmar de Varela","Municipio"],["08549","08","Piojó","Municipio"],["08558","08","Polonuevo","Municipio"],["08560","08","Ponedera","Municipio"],["08573","08","Puerto Colombia","Municipio"],["08606","08","Repelón","Municipio"],["08634","08","Sabanagrande","Municipio"],["08638","08","Sabanalarga","Municipio"],["08675","08","Santa Lucía","Municipio"],["08685","08","Santo Tomás","Municipio"],["08758","08","Soledad","Municipio"],["08770","08","Suan","Municipio"],["08832","08","Tubará","Municipio"],["08849","08","Usiacurí","Municipio"],["11001","11","Bogotá, D. C.","Municipio"],["13006","13","Achí","Municipio"],["13030","13","Altos del Rosario","Municipio"],["13042","13","Arenal","Municipio"],["13052","13","Arjona","Municipio"],["13062","13","Arroyohondo","Municipio"],["13074","13","Barranco de Loba","Municipio"],["13140","13","Calamar","Municipio"],["13160","13","Cantagallo","Municipio"],["13001","13","Cartagena de Indias","Municipio"],["13188","13","Cicuco","Municipio"],["13222","13","Clemencia","Municipio"],["13212","13","Córdoba","Municipio"],["13244","13","El Carmen de Bolívar","Municipio"],["13248","13","El Guamo","Municipio"],["13268","13","El Peñón","Municipio"],["13300","13","Hatillo de Loba","Municipio"],["13430","13","Magangué","Municipio"],["13433","13","Mahates","Municipio"],["13440","13","Margarita","Municipio"],["13442","13","María la Baja","Municipio"],["13458","13","Montecristo","Municipio"],["13473","13","Morales","Municipio"],["13490","13","Norosí","Municipio"],["13549","13","Pinillos","Municipio"],["13580","13","Regidor","Municipio"],["13600","13","Río Viejo","Municipio"],["13620","13","San Cristóbal","Municipio"],["13647","13","San Estanislao","Municipio"],["13650","13","San Fernando","Municipio"],["13654","13","San Jacinto","Municipio"],["13655","13","San Jacinto del Cauca","Municipio"],["13657","13","San Juan Nepomuceno","Municipio"],["13667","13","San Martín de Loba","Municipio"],["13670","13","San Pablo","Municipio"],["13673","13","Santa Catalina","Municipio"],["13468","13","Santa Cruz de Mompox","Municipio"],["13683","13","Santa Rosa","Municipio"],["13688","13","Santa Rosa del Sur","Municipio"],["13744","13","Simití","Municipio"],["13760","13","Soplaviento","Municipio"],["13780","13","Talaigua Nuevo","Municipio"],["13810","13","Tiquisio","Municipio"],["13836","13","Turbaco","Municipio"],["13838","13","Turbaná","Municipio"],["13873","13","Villanueva","Municipio"],["13894","13","Zambrano","Municipio"],["15022","15","Almeida","Municipio"],["15047","15","Aquitania","Municipio"],["15051","15","Arcabuco","Municipio"],["15087","15","Belén","Municipio"],["15090","15","Berbeo","Municipio"],["15092","15","Betéitiva","Municipio"],["15097","15","Boavita","Municipio"],["15104","15","Boyacá","Municipio"],["15106","15","Briceño","Municipio"],["15109","15","Buenavista","Municipio"],["15114","15","Busbanzá","Municipio"],["15131","15","Caldas","Municipio"],["15135","15","Campohermoso","Municipio"],["15162","15","Cerinza","Municipio"],["15172","15","Chinavita","Municipio"],["15176","15","Chiquinquirá","Municipio"],["15232","15","Chíquiza","Municipio"],["15180","15","Chiscas","Municipio"],["15183","15","Chita","Municipio"],["15185","15","Chitaraque","Municipio"],["15187","15","Chivatá","Municipio"],["15236","15","Chivor","Municipio"],["15189","15","Ciénega","Municipio"],["15204","15","Cómbita","Municipio"],["15212","15","Coper","Municipio"],["15215","15","Corrales","Municipio"],["15218","15","Covarachía","Municipio"],["15223","15","Cubará","Municipio"],["15224","15","Cucaita","Municipio"],["15226","15","Cuítiva","Municipio"],["15238","15","Duitama","Municipio"],["15244","15","El Cocuy","Municipio"],["15248","15","El Espino","Municipio"],["15272","15","Firavitoba","Municipio"],["15276","15","Floresta","Municipio"],["15293","15","Gachantivá","Municipio"],["15296","15","Gámeza","Municipio"],["15299","15","Garagoa","Municipio"],["15317","15","Guacamayas","Municipio"],["15322","15","Guateque","Municipio"],["15325","15","Guayatá","Municipio"],["15332","15","Güicán de la Sierra","Municipio"],["15362","15","Iza","Municipio"],["15367","15","Jenesano","Municipio"],["15368","15","Jericó","Municipio"],["15380","15","La Capilla","Municipio"],["15403","15","La Uvita","Municipio"],["15401","15","La Victoria","Municipio"],["15377","15","Labranzagrande","Municipio"],["15425","15","Macanal","Municipio"],["15442","15","Maripí","Municipio"],["15455","15","Miraflores","Municipio"],["15464","15","Mongua","Municipio"],["15466","15","Monguí","Municipio"],["15469","15","Moniquirá","Municipio"],["15476","15","Motavita","Municipio"],["15480","15","Muzo","Municipio"],["15491","15","Nobsa","Municipio"],["15494","15","Nuevo Colón","Municipio"],["15500","15","Oicatá","Municipio"],["15507","15","Otanche","Municipio"],["15511","15","Pachavita","Municipio"],["15514","15","Páez","Municipio"],["15516","15","Paipa","Municipio"],["15518","15","Pajarito","Municipio"],["15522","15","Panqueba","Municipio"],["15531","15","Pauna","Municipio"],["15533","15","Paya","Municipio"],["15537","15","Paz de Río","Municipio"],["15542","15","Pesca","Municipio"],["15550","15","Pisba","Municipio"],["15572","15","Puerto Boyacá","Municipio"],["15580","15","Quípama","Municipio"],["15599","15","Ramiriquí","Municipio"],["15600","15","Ráquira","Municipio"],["15621","15","Rondón","Municipio"],["15632","15","Saboyá","Municipio"],["15638","15","Sáchica","Municipio"],["15646","15","Samacá","Municipio"],["15660","15","San Eduardo","Municipio"],["15664","15","San José de Pare","Municipio"],["15667","15","San Luis de Gaceno","Municipio"],["15673","15","San Mateo","Municipio"],["15676","15","San Miguel de Sema","Municipio"],["15681","15","San Pablo de Borbur","Municipio"],["15690","15","Santa María","Municipio"],["15693","15","Santa Rosa de Viterbo","Municipio"],["15696","15","Santa Sofía","Municipio"],["15686","15","Santana","Municipio"],["15720","15","Sativanorte","Municipio"],["15723","15","Sativasur","Municipio"],["15740","15","Siachoque","Municipio"],["15753","15","Soatá","Municipio"],["15757","15","Socha","Municipio"],["15755","15","Socotá","Municipio"],["15759","15","Sogamoso","Municipio"],["15761","15","Somondoco","Municipio"],["15762","15","Sora","Municipio"],["15764","15","Soracá","Municipio"],["15763","15","Sotaquirá","Municipio"],["15774","15","Susacón","Municipio"],["15776","15","Sutamarchán","Municipio"],["15778","15","Sutatenza","Municipio"],["15790","15","Tasco","Municipio"],["15798","15","Tenza","Municipio"],["15804","15","Tibaná","Municipio"],["15806","15","Tibasosa","Municipio"],["15808","15","Tinjacá","Municipio"],["15810","15","Tipacoque","Municipio"],["15814","15","Toca","Municipio"],["15816","15","Togüí","Municipio"],["15820","15","Tópaga","Municipio"],["15822","15","Tota","Municipio"],["15001","15","Tunja","Municipio"],["15832","15","Tununguá","Municipio"],["15835","15","Turmequé","Municipio"],["15837","15","Tuta","Municipio"],["15839","15","Tutazá","Municipio"],["15842","15","Úmbita","Municipio"],["15861","15","Ventaquemada","Municipio"],["15407","15","Villa de Leyva","Municipio"],["15879","15","Viracachá","Municipio"],["15897","15","Zetaquira","Municipio"],["17013","17","Aguadas","Municipio"],["17042","17","Anserma","Municipio"],["17050","17","Aranzazu","Municipio"],["17088","17","Belalcázar","Municipio"],["17174","17","Chinchiná","Municipio"],["17272","17","Filadelfia","Municipio"],["17380","17","La Dorada","Municipio"],["17388","17","La Merced","Municipio"],["17001","17","Manizales","Municipio"],["17433","17","Manzanares","Municipio"],["17442","17","Marmato","Municipio"],["17444","17","Marquetalia","Municipio"],["17446","17","Marulanda","Municipio"],["17486","17","Neira","Municipio"],["17495","17","Norcasia","Municipio"],["17513","17","Pácora","Municipio"],["17524","17","Palestina","Municipio"],["17541","17","Pensilvania","Municipio"],["17614","17","Riosucio","Municipio"],["17616","17","Risaralda","Municipio"],["17653","17","Salamina","Municipio"],["17662","17","Samaná","Municipio"],["17665","17","San José","Municipio"],["17777","17","Supía","Municipio"],["17867","17","Victoria","Municipio"],["17873","17","Villamaría","Municipio"],["17877","17","Viterbo","Municipio"],["18029","18","Albania","Municipio"],["18094","18","Belén de los Andaquíes","Municipio"],["18150","18","Cartagena del Chairá","Municipio"],["18205","18","Curillo","Municipio"],["18247","18","El Doncello","Municipio"],["18256","18","El Paujíl","Municipio"],["18001","18","Florencia","Municipio"],["18410","18","La Montañita","Municipio"],["18460","18","Milán","Municipio"],["18479","18","Morelia","Municipio"],["18592","18","Puerto Rico","Municipio"],["18610","18","San José del Fragua","Municipio"],["18753","18","San Vicente del Caguán","Municipio"],["18756","18","Solano","Municipio"],["18785","18","Solita","Municipio"],["18860","18","Valparaíso","Municipio"],["85010","85","Aguazul","Municipio"],["85015","85","Chámeza","Municipio"],["85125","85","Hato Corozal","Municipio"],["85136","85","La Salina","Municipio"],["85139","85","Maní","Municipio"],["85162","85","Monterrey","Municipio"],["85225","85","Nunchía","Municipio"],["85230","85","Orocué","Municipio"],["85250","85","Paz de Ariporo","Municipio"],["85263","85","Pore","Municipio"],["85279","85","Recetor","Municipio"],["85300","85","Sabanalarga","Municipio"],["85315","85","Sácama","Municipio"],["85325","85","San Luis de Palenque","Municipio"],["85400","85","Támara","Municipio"],["85410","85","Tauramena","Municipio"],["85430","85","Trinidad","Municipio"],["85440","85","Villanueva","Municipio"],["85001","85","Yopal","Municipio"],["19022","19","Almaguer","Municipio"],["19050","19","Argelia","Municipio"],["19075","19","Balboa","Municipio"],["19100","19","Bolívar","Municipio"],["19110","19","Buenos Aires","Municipio"],["19130","19","Cajibío","Municipio"],["19137","19","Caldono","Municipio"],["19142","19","Caloto","Municipio"],["19212","19","Corinto","Municipio"],["19256","19","El Tambo","Municipio"],["19290","19","Florencia","Municipio"],["19300","19","Guachené","Municipio"],["19318","19","Guapi","Municipio"],["19355","19","Inzá","Municipio"],["19364","19","Jambaló","Municipio"],["19392","19","La Sierra","Municipio"],["19397","19","La Vega","Municipio"],["19418","19","López de Micay","Municipio"],["19450","19","Mercaderes","Municipio"],["19455","19","Miranda","Municipio"],["19473","19","Morales","Municipio"],["19513","19","Padilla","Municipio"],["19517","19","Páez","Municipio"],["19532","19","Patía","Municipio"],["19533","19","Piamonte","Municipio"],["19548","19","Piendamó - Tunía","Municipio"],["19001","19","Popayán","Municipio"],["19573","19","Puerto Tejada","Municipio"],["19585","19","Puracé","Municipio"],["19622","19","Rosas","Municipio"],["19693","19","San Sebastián","Municipio"],["19701","19","Santa Rosa","Municipio"],["19698","19","Santander de Quilichao","Municipio"],["19743","19","Silvia","Municipio"],["19760","19","Sotará - Paispamba","Municipio"],["19780","19","Suárez","Municipio"],["19785","19","Sucre","Municipio"],["19807","19","Timbío","Municipio"],["19809","19","Timbiquí","Municipio"],["19821","19","Toribío","Municipio"],["19824","19","Totoró","Municipio"],["19845","19","Villa Rica","Municipio"],["20011","20","Aguachica","Municipio"],["20013","20","Agustín Codazzi","Municipio"],["20032","20","Astrea","Municipio"],["20045","20","Becerril","Municipio"],["20060","20","Bosconia","Municipio"],["20175","20","Chimichagua","Municipio"],["20178","20","Chiriguaná","Municipio"],["20228","20","Curumaní","Municipio"],["20238","20","El Copey","Municipio"],["20250","20","El Paso","Municipio"],["20295","20","Gamarra","Municipio"],["20310","20","González","Municipio"],["20383","20","La Gloria","Municipio"],["20400","20","La Jagua de Ibirico","Municipio"],["20621","20","La Paz","Municipio"],["20443","20","Manaure Balcón del Cesar","Municipio"],["20517","20","Pailitas","Municipio"],["20550","20","Pelaya","Municipio"],["20570","20","Pueblo Bello","Municipio"],["20614","20","Río de Oro","Municipio"],["20710","20","San Alberto","Municipio"],["20750","20","San Diego","Municipio"],["20770","20","San Martín","Municipio"],["20787","20","Tamalameque","Municipio"],["20001","20","Valledupar","Municipio"],["27006","27","Acandí","Municipio"],["27025","27","Alto Baudó","Municipio"],["27050","27","Atrato","Municipio"],["27073","27","Bagadó","Municipio"],["27075","27","Bahía Solano","Municipio"],["27077","27","Bajo Baudó","Municipio"],["27099","27","Bojayá","Municipio"],["27150","27","Carmen del Darién","Municipio"],["27160","27","Cértegui","Municipio"],["27205","27","Condoto","Municipio"],["27135","27","El Cantón del San Pablo","Municipio"],["27245","27","El Carmen de Atrato","Municipio"],["27250","27","El Litoral del San Juan","Municipio"],["27361","27","Istmina","Municipio"],["27372","27","Juradó","Municipio"],["27413","27","Lloró","Municipio"],["27425","27","Medio Atrato","Municipio"],["27430","27","Medio Baudó","Municipio"],["27450","27","Medio San Juan","Municipio"],["27491","27","Nóvita","Municipio"],["27493","27","Nuevo Belén de Bajirá","Municipio"],["27495","27","Nuquí","Municipio"],["27001","27","Quibdó","Municipio"],["27580","27","Río Iró","Municipio"],["27600","27","Río Quito","Municipio"],["27615","27","Riosucio","Municipio"],["27660","27","San José del Palmar","Municipio"],["27745","27","Sipí","Municipio"],["27787","27","Tadó","Municipio"],["27800","27","Unguía","Municipio"],["27810","27","Unión Panamericana","Municipio"],["23068","23","Ayapel","Municipio"],["23079","23","Buenavista","Municipio"],["23090","23","Canalete","Municipio"],["23162","23","Cereté","Municipio"],["23168","23","Chimá","Municipio"],["23182","23","Chinú","Municipio"],["23189","23","Ciénaga de Oro","Municipio"],["23300","23","Cotorra","Municipio"],["23350","23","La Apartada","Municipio"],["23417","23","Lorica","Municipio"],["23419","23","Los Córdobas","Municipio"],["23464","23","Momil","Municipio"],["23466","23","Montelíbano","Municipio"],["23001","23","Montería","Municipio"],["23500","23","Moñitos","Municipio"],["23555","23","Planeta Rica","Municipio"],["23570","23","Pueblo Nuevo","Municipio"],["23574","23","Puerto Escondido","Municipio"],["23580","23","Puerto Libertador","Municipio"],["23586","23","Purísima de la Concepción","Municipio"],["23660","23","Sahagún","Municipio"],["23670","23","San Andrés de Sotavento","Municipio"],["23672","23","San Antero","Municipio"],["23675","23","San Bernardo del Viento","Municipio"],["23678","23","San Carlos","Municipio"],["23682","23","San José de Uré","Municipio"],["23686","23","San Pelayo","Municipio"],["23807","23","Tierralta","Municipio"],["23815","23","Tuchín","Municipio"],["23855","23","Valencia","Municipio"],["25001","25","Agua de Dios","Municipio"],["25019","25","Albán","Municipio"],["25035","25","Anapoima","Municipio"],["25040","25","Anolaima","Municipio"],["25599","25","Apulo","Municipio"],["25053","25","Arbeláez","Municipio"],["25086","25","Beltrán","Municipio"],["25095","25","Bituima","Municipio"],["25099","25","Bojacá","Municipio"],["25120","25","Cabrera","Municipio"],["25123","25","Cachipay","Municipio"],["25126","25","Cajicá","Municipio"],["25148","25","Caparrapí","Municipio"],["25151","25","Cáqueza","Municipio"],["25154","25","Carmen de Carupa","Municipio"],["25168","25","Chaguaní","Municipio"],["25175","25","Chía","Municipio"],["25178","25","Chipaque","Municipio"],["25181","25","Choachí","Municipio"],["25183","25","Chocontá","Municipio"],["25200","25","Cogua","Municipio"],["25214","25","Cota","Municipio"],["25224","25","Cucunubá","Municipio"],["25245","25","El Colegio","Municipio"],["25258","25","El Peñón","Municipio"],["25260","25","El Rosal","Municipio"],["25269","25","Facatativá","Municipio"],["25279","25","Fómeque","Municipio"],["25281","25","Fosca","Municipio"],["25286","25","Funza","Municipio"],["25288","25","Fúquene","Municipio"],["25290","25","Fusagasugá","Municipio"],["25293","25","Gachalá","Municipio"],["25295","25","Gachancipá","Municipio"],["25297","25","Gachetá","Municipio"],["25299","25","Gama","Municipio"],["25307","25","Girardot","Municipio"],["25312","25","Granada","Municipio"],["25317","25","Guachetá","Municipio"],["25320","25","Guaduas","Municipio"],["25322","25","Guasca","Municipio"],["25324","25","Guataquí","Municipio"],["25326","25","Guatavita","Municipio"],["25328","25","Guayabal de Síquima","Municipio"],["25335","25","Guayabetal","Municipio"],["25339","25","Gutiérrez","Municipio"],["25368","25","Jerusalén","Municipio"],["25372","25","Junín","Municipio"],["25377","25","La Calera","Municipio"],["25386","25","La Mesa","Municipio"],["25394","25","La Palma","Municipio"],["25398","25","La Peña","Municipio"],["25402","25","La Vega","Municipio"],["25407","25","Lenguazaque","Municipio"],["25426","25","Machetá","Municipio"],["25430","25","Madrid","Municipio"],["25436","25","Manta","Municipio"],["25438","25","Medina","Municipio"],["25473","25","Mosquera","Municipio"],["25483","25","Nariño","Municipio"],["25486","25","Nemocón","Municipio"],["25488","25","Nilo","Municipio"],["25489","25","Nimaima","Municipio"],["25491","25","Nocaima","Municipio"],["25513","25","Pacho","Municipio"],["25518","25","Paime","Municipio"],["25524","25","Pandi","Municipio"],["25530","25","Paratebueno","Municipio"],["25535","25","Pasca","Municipio"],["25572","25","Puerto Salgar","Municipio"],["25580","25","Pulí","Municipio"],["25592","25","Quebradanegra","Municipio"],["25594","25","Quetame","Municipio"],["25596","25","Quipile","Municipio"],["25612","25","Ricaurte","Municipio"],["25645","25","San Antonio del Tequendama","Municipio"],["25649","25","San Bernardo","Municipio"],["25653","25","San Cayetano","Municipio"],["25658","25","San Francisco","Municipio"],["25662","25","San Juan de Rioseco","Municipio"],["25718","25","Sasaima","Municipio"],["25736","25","Sesquilé","Municipio"],["25740","25","Sibaté","Municipio"],["25743","25","Silvania","Municipio"],["25745","25","Simijaca","Municipio"],["25754","25","Soacha","Municipio"],["25758","25","Sopó","Municipio"],["25769","25","Subachoque","Municipio"],["25772","25","Suesca","Municipio"],["25777","25","Supatá","Municipio"],["25779","25","Susa","Municipio"],["25781","25","Sutatausa","Municipio"],["25785","25","Tabio","Municipio"],["25793","25","Tausa","Municipio"],["25797","25","Tena","Municipio"],["25799","25","Tenjo","Municipio"],["25805","25","Tibacuy","Municipio"],["25807","25","Tibirita","Municipio"],["25815","25","Tocaima","Municipio"],["25817","25","Tocancipá","Municipio"],["25823","25","Topaipí","Municipio"],["25839","25","Ubalá","Municipio"],["25841","25","Ubaque","Municipio"],["25845","25","Une","Municipio"],["25851","25","Útica","Municipio"],["25506","25","Venecia","Municipio"],["25862","25","Vergara","Municipio"],["25867","25","Vianí","Municipio"],["25843","25","Villa de San Diego de Ubaté","Municipio"],["25871","25","Villagómez","Municipio"],["25873","25","Villapinzón","Municipio"],["25875","25","Villeta","Municipio"],["25878","25","Viotá","Municipio"],["25885","25","Yacopí","Municipio"],["25898","25","Zipacón","Municipio"],["25899","25","Zipaquirá","Municipio"],["94343","94","Barrancominas","Municipio"],["94886","94","Cacahual","Área no municipalizada"],["94001","94","Inírida","Municipio"],["94885","94","La Guadalupe","Área no municipalizada"],["94888","94","Morichal","Área no municipalizada"],["94887","94","Pana Pana","Área no municipalizada"],["94884","94","Puerto Colombia","Área no municipalizada"],["94883","94","San Felipe","Área no municipalizada"],["95015","95","Calamar","Municipio"],["95025","95","El Retorno","Municipio"],["95200","95","Miraflores","Municipio"],["95001","95","San José del Guaviare","Municipio"],["41006","41","Acevedo","Municipio"],["41013","41","Agrado","Municipio"],["41016","41","Aipe","Municipio"],["41020","41","Algeciras","Municipio"],["41026","41","Altamira","Municipio"],["41078","41","Baraya","Municipio"],["41132","41","Campoalegre","Municipio"],["41206","41","Colombia","Municipio"],["41244","41","Elías","Municipio"],["41298","41","Garzón","Municipio"],["41306","41","Gigante","Municipio"],["41319","41","Guadalupe","Municipio"],["41349","41","Hobo","Municipio"],["41357","41","Íquira","Municipio"],["41359","41","Isnos","Municipio"],["41378","41","La Argentina","Municipio"],["41396","41","La Plata","Municipio"],["41483","41","Nátaga","Municipio"],["41001","41","Neiva","Municipio"],["41503","41","Oporapa","Municipio"],["41518","41","Paicol","Municipio"],["41524","41","Palermo","Municipio"],["41530","41","Palestina","Municipio"],["41548","41","Pital","Municipio"],["41551","41","Pitalito","Municipio"],["41615","41","Rivera","Municipio"],["41660","41","Saladoblanco","Municipio"],["41668","41","San Agustín","Municipio"],["41676","41","Santa María","Municipio"],["41770","41","Suaza","Municipio"],["41791","41","Tarqui","Municipio"],["41799","41","Tello","Municipio"],["41801","41","Teruel","Municipio"],["41797","41","Tesalia","Municipio"],["41807","41","Timaná","Municipio"],["41872","41","Villavieja","Municipio"],["41885","41","Yaguará","Municipio"],["44035","44","Albania","Municipio"],["44078","44","Barrancas","Municipio"],["44090","44","Dibulla","Municipio"],["44098","44","Distracción","Municipio"],["44110","44","El Molino","Municipio"],["44279","44","Fonseca","Municipio"],["44378","44","Hatonuevo","Municipio"],["44420","44","La Jagua del Pilar","Municipio"],["44430","44","Maicao","Municipio"],["44560","44","Manaure","Municipio"],["44001","44","Riohacha","Municipio"],["44650","44","San Juan del Cesar","Municipio"],["44847","44","Uribia","Municipio"],["44855","44","Urumita","Municipio"],["44874","44","Villanueva","Municipio"],["47030","47","Algarrobo","Municipio"],["47053","47","Aracataca","Municipio"],["47058","47","Ariguaní","Municipio"],["47161","47","Cerro de San Antonio","Municipio"],["47170","47","Chivolo","Municipio"],["47189","47","Ciénaga","Municipio"],["47205","47","Concordia","Municipio"],["47245","47","El Banco","Municipio"],["47258","47","El Piñón","Municipio"],["47268","47","El Retén","Municipio"],["47288","47","Fundación","Municipio"],["47318","47","Guamal","Municipio"],["47460","47","Nueva Granada","Municipio"],["47541","47","Pedraza","Municipio"],["47545","47","Pijiño del Carmen","Municipio"],["47551","47","Pivijay","Municipio"],["47555","47","Plato","Municipio"],["47570","47","Puebloviejo","Municipio"],["47605","47","Remolino","Municipio"],["47660","47","Sabanas de San Ángel","Municipio"],["47675","47","Salamina","Municipio"],["47692","47","San Sebastián de Buenavista","Municipio"],["47703","47","San Zenón","Municipio"],["47707","47","Santa Ana","Municipio"],["47720","47","Santa Bárbara de Pinto","Municipio"],["47001","47","Santa Marta","Municipio"],["47745","47","Sitionuevo","Municipio"],["47798","47","Tenerife","Municipio"],["47960","47","Zapayán","Municipio"],["47980","47","Zona Bananera","Municipio"],["50006","50","Acacías","Municipio"],["50110","50","Barranca de Upía","Municipio"],["50124","50","Cabuyaro","Municipio"],["50150","50","Castilla la Nueva","Municipio"],["50223","50","Cubarral","Municipio"],["50226","50","Cumaral","Municipio"],["50245","50","El Calvario","Municipio"],["50251","50","El Castillo","Municipio"],["50270","50","El Dorado","Municipio"],["50287","50","Fuente de Oro","Municipio"],["50313","50","Granada","Municipio"],["50318","50","Guamal","Municipio"],["50350","50","La Macarena","Municipio"],["50400","50","Lejanías","Municipio"],["50325","50","Mapiripán","Municipio"],["50330","50","Mesetas","Municipio"],["50450","50","Puerto Concordia","Municipio"],["50568","50","Puerto Gaitán","Municipio"],["50577","50","Puerto Lleras","Municipio"],["50573","50","Puerto López","Municipio"],["50590","50","Puerto Rico","Municipio"],["50606","50","Restrepo","Municipio"],["50680","50","San Carlos de Guaroa","Municipio"],["50683","50","San Juan de Arama","Municipio"],["50686","50","San Juanito","Municipio"],["50689","50","San Martín","Municipio"],["50370","50","Uribe","Municipio"],["50001","50","Villavicencio","Municipio"],["50711","50","Vistahermosa","Municipio"],["52019","52","Albán","Municipio"],["52022","52","Aldana","Municipio"],["52036","52","Ancuya","Municipio"],["52051","52","Arboleda","Municipio"],["52079","52","Barbacoas","Municipio"],["52083","52","Belén","Municipio"],["52110","52","Buesaco","Municipio"],["52240","52","Chachagüí","Municipio"],["52203","52","Colón","Municipio"],["52207","52","Consacá","Municipio"],["52210","52","Contadero","Municipio"],["52215","52","Córdoba","Municipio"],["52224","52","Cuaspud Carlosama","Municipio"],["52227","52","Cumbal","Municipio"],["52233","52","Cumbitara","Municipio"],["52250","52","El Charco","Municipio"],["52254","52","El Peñol","Municipio"],["52256","52","El Rosario","Municipio"],["52258","52","El Tablón de Gómez","Municipio"],["52260","52","El Tambo","Municipio"],["52520","52","Francisco Pizarro","Municipio"],["52287","52","Funes","Municipio"],["52317","52","Guachucal","Municipio"],["52320","52","Guaitarilla","Municipio"],["52323","52","Gualmatán","Municipio"],["52352","52","Iles","Municipio"],["52354","52","Imués","Municipio"],["52356","52","Ipiales","Municipio"],["52378","52","La Cruz","Municipio"],["52381","52","La Florida","Municipio"],["52385","52","La Llanada","Municipio"],["52390","52","La Tola","Municipio"],["52399","52","La Unión","Municipio"],["52405","52","Leiva","Municipio"],["52411","52","Linares","Municipio"],["52418","52","Los Andes","Municipio"],["52427","52","Magüí","Municipio"],["52435","52","Mallama","Municipio"],["52473","52","Mosquera","Municipio"],["52480","52","Nariño","Municipio"],["52490","52","Olaya Herrera","Municipio"],["52506","52","Ospina","Municipio"],["52001","52","Pasto","Municipio"],["52540","52","Policarpa","Municipio"],["52560","52","Potosí","Municipio"],["52565","52","Providencia","Municipio"],["52573","52","Puerres","Municipio"],["52585","52","Pupiales","Municipio"],["52612","52","Ricaurte","Municipio"],["52621","52","Roberto Payán","Municipio"],["52678","52","Samaniego","Municipio"],["52835","52","San Andrés de Tumaco","Municipio"],["52685","52","San Bernardo","Municipio"],["52687","52","San Lorenzo","Municipio"],["52693","52","San Pablo","Municipio"],["52694","52","San Pedro de Cartago","Municipio"],["52683","52","Sandoná","Municipio"],["52696","52","Santa Bárbara","Municipio"],["52699","52","Santacruz","Municipio"],["52720","52","Sapuyes","Municipio"],["52786","52","Taminango","Municipio"],["52788","52","Tangua","Municipio"],["52838","52","Túquerres","Municipio"],["52885","52","Yacuanquer","Municipio"],["54003","54","Ábrego","Municipio"],["54051","54","Arboledas","Municipio"],["54099","54","Bochalema","Municipio"],["54109","54","Bucarasica","Municipio"],["54128","54","Cáchira","Municipio"],["54125","54","Cácota","Municipio"],["54172","54","Chinácota","Municipio"],["54174","54","Chitagá","Municipio"],["54206","54","Convención","Municipio"],["54223","54","Cucutilla","Municipio"],["54239","54","Durania","Municipio"],["54245","54","El Carmen","Municipio"],["54250","54","El Tarra","Municipio"],["54261","54","El Zulia","Municipio"],["54313","54","Gramalote","Municipio"],["54344","54","Hacarí","Municipio"],["54347","54","Herrán","Municipio"],["54385","54","La Esperanza","Municipio"],["54398","54","La Playa","Municipio"],["54377","54","Labateca","Municipio"],["54405","54","Los Patios","Municipio"],["54418","54","Lourdes","Municipio"],["54480","54","Mutiscua","Municipio"],["54498","54","Ocaña","Municipio"],["54518","54","Pamplona","Municipio"],["54520","54","Pamplonita","Municipio"],["54553","54","Puerto Santander","Municipio"],["54599","54","Ragonvalia","Municipio"],["54660","54","Salazar","Municipio"],["54670","54","San Calixto","Municipio"],["54673","54","San Cayetano","Municipio"],["54001","54","San José de Cúcuta","Municipio"],["54680","54","Santiago","Municipio"],["54720","54","Sardinata","Municipio"],["54743","54","Silos","Municipio"],["54800","54","Teorama","Municipio"],["54810","54","Tibú","Municipio"],["54820","54","Toledo","Municipio"],["54871","54","Villa Caro","Municipio"],["54874","54","Villa del Rosario","Municipio"],["86219","86","Colón","Municipio"],["86001","86","Mocoa","Municipio"],["86320","86","Orito","Municipio"],["86568","86","Puerto Asís","Municipio"],["86569","86","Puerto Caicedo","Municipio"],["86571","86","Puerto Guzmán","Municipio"],["86573","86","Puerto Leguízamo","Municipio"],["86755","86","San Francisco","Municipio"],["86757","86","San Miguel","Municipio"],["86760","86","Santiago","Municipio"],["86749","86","Sibundoy","Municipio"],["86865","86","Valle del Guamuez","Municipio"],["86885","86","Villagarzón","Municipio"],["63001","63","Armenia","Municipio"],["63111","63","Buenavista","Municipio"],["63130","63","Calarcá","Municipio"],["63190","63","Circasia","Municipio"],["63212","63","Córdoba","Municipio"],["63272","63","Filandia","Municipio"],["63302","63","Génova","Municipio"],["63401","63","La Tebaida","Municipio"],["63470","63","Montenegro","Municipio"],["63548","63","Pijao","Municipio"],["63594","63","Quimbaya","Municipio"],["63690","63","Salento","Municipio"],["66045","66","Apía","Municipio"],["66075","66","Balboa","Municipio"],["66088","66","Belén de Umbría","Municipio"],["66170","66","Dosquebradas","Municipio"],["66318","66","Guática","Municipio"],["66383","66","La Celia","Municipio"],["66400","66","La Virginia","Municipio"],["66440","66","Marsella","Municipio"],["66456","66","Mistrató","Municipio"],["66001","66","Pereira","Municipio"],["66572","66","Pueblo Rico","Municipio"],["66594","66","Quinchía","Municipio"],["66682","66","Santa Rosa de Cabal","Municipio"],["66687","66","Santuario","Municipio"],["68013","68","Aguada","Municipio"],["68020","68","Albania","Municipio"],["68051","68","Aratoca","Municipio"],["68077","68","Barbosa","Municipio"],["68079","68","Barichara","Municipio"],["68081","68","Barrancabermeja","Municipio"],["68092","68","Betulia","Municipio"],["68101","68","Bolívar","Municipio"],["68001","68","Bucaramanga","Municipio"],["68121","68","Cabrera","Municipio"],["68132","68","California","Municipio"],["68147","68","Capitanejo","Municipio"],["68152","68","Carcasí","Municipio"],["68160","68","Cepitá","Municipio"],["68162","68","Cerrito","Municipio"],["68167","68","Charalá","Municipio"],["68169","68","Charta","Municipio"],["68176","68","Chima","Municipio"],["68179","68","Chipatá","Municipio"],["68190","68","Cimitarra","Municipio"],["68207","68","Concepción","Municipio"],["68209","68","Confines","Municipio"],["68211","68","Contratación","Municipio"],["68217","68","Coromoro","Municipio"],["68229","68","Curití","Municipio"],["68235","68","El Carmen de Chucurí","Municipio"],["68245","68","El Guacamayo","Municipio"],["68250","68","El Peñón","Municipio"],["68255","68","El Playón","Municipio"],["68264","68","Encino","Municipio"],["68266","68","Enciso","Municipio"],["68271","68","Florián","Municipio"],["68276","68","Floridablanca","Municipio"],["68296","68","Galán","Municipio"],["68298","68","Gámbita","Municipio"],["68307","68","Girón","Municipio"],["68318","68","Guaca","Municipio"],["68320","68","Guadalupe","Municipio"],["68322","68","Guapotá","Municipio"],["68324","68","Guavatá","Municipio"],["68327","68","Güepsa","Municipio"],["68344","68","Hato","Municipio"],["68368","68","Jesús María","Municipio"],["68370","68","Jordán","Municipio"],["68377","68","La Belleza","Municipio"],["68397","68","La Paz","Municipio"],["68385","68","Landázuri","Municipio"],["68406","68","Lebrija","Municipio"],["68418","68","Los Santos","Municipio"],["68425","68","Macaravita","Municipio"],["68432","68","Málaga","Municipio"],["68444","68","Matanza","Municipio"],["68464","68","Mogotes","Municipio"],["68468","68","Molagavita","Municipio"],["68498","68","Ocamonte","Municipio"],["68500","68","Oiba","Municipio"],["68502","68","Onzaga","Municipio"],["68522","68","Palmar","Municipio"],["68524","68","Palmas del Socorro","Municipio"],["68533","68","Páramo","Municipio"],["68547","68","Piedecuesta","Municipio"],["68549","68","Pinchote","Municipio"],["68572","68","Puente Nacional","Municipio"],["68573","68","Puerto Parra","Municipio"],["68575","68","Puerto Wilches","Municipio"],["68615","68","Rionegro","Municipio"],["68655","68","Sabana de Torres","Municipio"],["68669","68","San Andrés","Municipio"],["68673","68","San Benito","Municipio"],["68679","68","San Gil","Municipio"],["68682","68","San Joaquín","Municipio"],["68684","68","San José de Miranda","Municipio"],["68686","68","San Miguel","Municipio"],["68689","68","San Vicente de Chucurí","Municipio"],["68705","68","Santa Bárbara","Municipio"],["68720","68","Santa Helena del Opón","Municipio"],["68745","68","Simacota","Municipio"],["68755","68","Socorro","Municipio"],["68770","68","Suaita","Municipio"],["68773","68","Sucre","Municipio"],["68780","68","Suratá","Municipio"],["68820","68","Tona","Municipio"],["68855","68","Valle de San José","Municipio"],["68861","68","Vélez","Municipio"],["68867","68","Vetas","Municipio"],["68872","68","Villanueva","Municipio"],["68895","68","Zapatoca","Municipio"],["70110","70","Buenavista","Municipio"],["70124","70","Caimito","Municipio"],["70230","70","Chalán","Municipio"],["70204","70","Colosó","Municipio"],["70215","70","Corozal","Municipio"],["70221","70","Coveñas","Municipio"],["70233","70","El Roble","Municipio"],["70235","70","Galeras","Municipio"],["70265","70","Guaranda","Municipio"],["70400","70","La Unión","Municipio"],["70418","70","Los Palmitos","Municipio"],["70429","70","Majagual","Municipio"],["70473","70","Morroa","Municipio"],["70508","70","Ovejas","Municipio"],["70523","70","Palmito","Municipio"],["70670","70","Sampués","Municipio"],["70678","70","San Benito Abad","Municipio"],["70823","70","San José de Toluviejo","Municipio"],["70702","70","San Juan de Betulia","Municipio"],["70742","70","San Luis de Sincé","Municipio"],["70708","70","San Marcos","Municipio"],["70713","70","San Onofre","Municipio"],["70717","70","San Pedro","Municipio"],["70820","70","Santiago de Tolú","Municipio"],["70001","70","Sincelejo","Municipio"],["70771","70","Sucre","Municipio"],["73024","73","Alpujarra","Municipio"],["73026","73","Alvarado","Municipio"],["73030","73","Ambalema","Municipio"],["73043","73","Anzoátegui","Municipio"],["73055","73","Armero","Municipio"],["73067","73","Ataco","Municipio"],["73124","73","Cajamarca","Municipio"],["73148","73","Carmen de Apicalá","Municipio"],["73152","73","Casabianca","Municipio"],["73168","73","Chaparral","Municipio"],["73200","73","Coello","Municipio"],["73217","73","Coyaima","Municipio"],["73226","73","Cunday","Municipio"],["73236","73","Dolores","Municipio"],["73268","73","Espinal","Municipio"],["73270","73","Falan","Municipio"],["73275","73","Flandes","Municipio"],["73283","73","Fresno","Municipio"],["73319","73","Guamo","Municipio"],["73347","73","Herveo","Municipio"],["73349","73","Honda","Municipio"],["73001","73","Ibagué","Municipio"],["73352","73","Icononzo","Municipio"],["73408","73","Lérida","Municipio"],["73411","73","Líbano","Municipio"],["73449","73","Melgar","Municipio"],["73461","73","Murillo","Municipio"],["73483","73","Natagaima","Municipio"],["73504","73","Ortega","Municipio"],["73520","73","Palocabildo","Municipio"],["73547","73","Piedras","Municipio"],["73555","73","Planadas","Municipio"],["73563","73","Prado","Municipio"],["73585","73","Purificación","Municipio"],["73616","73","Rioblanco","Municipio"],["73622","73","Roncesvalles","Municipio"],["73624","73","Rovira","Municipio"],["73671","73","Saldaña","Municipio"],["73675","73","San Antonio","Municipio"],["73678","73","San Luis","Municipio"],["73443","73","San Sebastián de Mariquita","Municipio"],["73686","73","Santa Isabel","Municipio"],["73770","73","Suárez","Municipio"],["73854","73","Valle de San Juan","Municipio"],["73861","73","Venadillo","Municipio"],["73870","73","Villahermosa","Municipio"],["73873","73","Villarrica","Municipio"],["76020","76","Alcalá","Municipio"],["76036","76","Andalucía","Municipio"],["76041","76","Ansermanuevo","Municipio"],["76054","76","Argelia","Municipio"],["76100","76","Bolívar","Municipio"],["76109","76","Buenaventura","Municipio"],["76113","76","Bugalagrande","Municipio"],["76122","76","Caicedonia","Municipio"],["76126","76","Calima","Municipio"],["76130","76","Candelaria","Municipio"],["76147","76","Cartago","Municipio"],["76233","76","Dagua","Municipio"],["76243","76","El Águila","Municipio"],["76246","76","El Cairo","Municipio"],["76248","76","El Cerrito","Municipio"],["76250","76","El Dovio","Municipio"],["76275","76","Florida","Municipio"],["76306","76","Ginebra","Municipio"],["76318","76","Guacarí","Municipio"],["76111","76","Guadalajara de Buga","Municipio"],["76364","76","Jamundí","Municipio"],["76377","76","La Cumbre","Municipio"],["76400","76","La Unión","Municipio"],["76403","76","La Victoria","Municipio"],["76497","76","Obando","Municipio"],["76520","76","Palmira","Municipio"],["76563","76","Pradera","Municipio"],["76606","76","Restrepo","Municipio"],["76616","76","Riofrío","Municipio"],["76622","76","Roldanillo","Municipio"],["76670","76","San Pedro","Municipio"],["76001","76","Santiago de Cali","Municipio"],["76736","76","Sevilla","Municipio"],["76823","76","Toro","Municipio"],["76828","76","Trujillo","Municipio"],["76834","76","Tuluá","Municipio"],["76845","76","Ulloa","Municipio"],["76863","76","Versalles","Municipio"],["76869","76","Vijes","Municipio"],["76890","76","Yotoco","Municipio"],["76892","76","Yumbo","Municipio"],["76895","76","Zarzal","Municipio"],["97161","97","Carurú","Municipio"],["97001","97","Mitú","Municipio"],["97511","97","Pacoa","Área no municipalizada"],["97777","97","Papunahua","Área no municipalizada"],["97666","97","Taraira","Municipio"],["97889","97","Yavaraté","Área no municipalizada"],["99773","99","Cumaribo","Municipio"],["99524","99","La Primavera","Municipio"],["99001","99","Puerto Carreño","Municipio"],["99624","99","Santa Rosalía","Municipio"]];

const DEPARTMENT_BY_CODE = new Map<string, DivipolaDepartment>(
  DIVIPOLA_DEPARTMENTS.map((d) => [d.code, d]),
);

export const DIVIPOLA_MUNICIPALITIES: readonly DivipolaMunicipality[] = RAW_MUNICIPALITIES.map(
  ([code, departmentCode, name, type]) => ({
    code,
    departmentCode,
    departmentName: DEPARTMENT_BY_CODE.get(departmentCode)?.name ?? '',
    name,
    type,
  }),
);

/**
 * Normaliza un texto para búsquedas y comparaciones insensibles a mayúsculas, tildes
 * y signos de puntuación secundarios, conservando la letra ñ.
 */
export function normalizeDivipolaText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .trim()
    .toLocaleLowerCase('es-CO')
    .replace(/ñ/g, '__enie__')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/__enie__/g, 'ñ')
    .replace(/[.,;()\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const DEPARTMENT_BY_NORMALIZED_NAME = new Map<string, DivipolaDepartment>();
for (const dept of DIVIPOLA_DEPARTMENTS) {
  DEPARTMENT_BY_NORMALIZED_NAME.set(normalizeDivipolaText(dept.name), dept);
}
// Alias frecuentes en registros históricos para Bogotá, D. C. y San Andrés
const BOGOTA_DEPT = DEPARTMENT_BY_CODE.get('11');
if (BOGOTA_DEPT) {
  DEPARTMENT_BY_NORMALIZED_NAME.set('bogota', BOGOTA_DEPT);
  DEPARTMENT_BY_NORMALIZED_NAME.set('bogota d c', BOGOTA_DEPT);
  DEPARTMENT_BY_NORMALIZED_NAME.set('bogota dc', BOGOTA_DEPT);
  DEPARTMENT_BY_NORMALIZED_NAME.set('distrito capital', BOGOTA_DEPT);
}
const SAN_ANDRES_DEPT = DEPARTMENT_BY_CODE.get('88');
if (SAN_ANDRES_DEPT) {
  DEPARTMENT_BY_NORMALIZED_NAME.set('san andres y providencia', SAN_ANDRES_DEPT);
  DEPARTMENT_BY_NORMALIZED_NAME.set('san andres providencia y santa catalina', SAN_ANDRES_DEPT);
  DEPARTMENT_BY_NORMALIZED_NAME.set('san andres', SAN_ANDRES_DEPT);
}

const MUNICIPALITY_BY_CODE = new Map<string, DivipolaMunicipality>(
  DIVIPOLA_MUNICIPALITIES.map((m) => [m.code, m]),
);

const MUNICIPALITIES_BY_DEPT_CODE = new Map<string, DivipolaMunicipality[]>();
const MUNICIPALITIES_BY_NORMALIZED_NAME = new Map<string, DivipolaMunicipality[]>();

for (const mpio of DIVIPOLA_MUNICIPALITIES) {
  const deptList = MUNICIPALITIES_BY_DEPT_CODE.get(mpio.departmentCode) ?? [];
  deptList.push(mpio);
  MUNICIPALITIES_BY_DEPT_CODE.set(mpio.departmentCode, deptList);

  const normName = normalizeDivipolaText(mpio.name);
  const nameList = MUNICIPALITIES_BY_NORMALIZED_NAME.get(normName) ?? [];
  nameList.push(mpio);
  MUNICIPALITIES_BY_NORMALIZED_NAME.set(normName, nameList);
}

const BOGOTA_MPIO = MUNICIPALITY_BY_CODE.get('11001');
if (BOGOTA_MPIO) {
  for (const alias of ['bogota', 'bogota d c', 'bogota dc']) {
    const existing = MUNICIPALITIES_BY_NORMALIZED_NAME.get(alias) ?? [];
    if (!existing.some((m) => m.code === '11001')) {
      MUNICIPALITIES_BY_NORMALIZED_NAME.set(alias, [...existing, BOGOTA_MPIO]);
    }
  }
}

/**
 * Busca un departamento en el catálogo DIVIPOLA por código DANE (2 dígitos, ej. '05', '70')
 * o por su nombre (con o sin tildes).
 */
export function findDivipolaDepartment(
  codeOrName: string | null | undefined,
): DivipolaDepartment | null {
  if (!codeOrName || typeof codeOrName !== 'string') return null;
  const trimmed = codeOrName.trim();
  if (!trimmed) return null;
  if (/^\d{2}$/.test(trimmed)) {
    return DEPARTMENT_BY_CODE.get(trimmed) ?? null;
  }
  return DEPARTMENT_BY_NORMALIZED_NAME.get(normalizeDivipolaText(trimmed)) ?? null;
}

/**
 * Busca un municipio por su código DANE exacto de 5 dígitos (ej. '70001', '05001').
 */
export function findDivipolaMunicipalityByCode(
  code: string | null | undefined,
): DivipolaMunicipality | null {
  if (!code || typeof code !== 'string') return null;
  const trimmed = code.trim();
  if (!/^\d{5}$/.test(trimmed)) return null;
  return MUNICIPALITY_BY_CODE.get(trimmed) ?? null;
}

/**
 * Devuelve la lista de municipios pertenecientes a un departamento (por código o nombre).
 */
export function getMunicipalitiesByDepartment(
  departmentCodeOrName: string | null | undefined,
): DivipolaMunicipality[] {
  const dept = findDivipolaDepartment(departmentCodeOrName);
  if (!dept) return [];
  return MUNICIPALITIES_BY_DEPT_CODE.get(dept.code) ?? [];
}

/**
 * Busca un municipio dentro de un departamento específico por código DANE (5 dígitos)
 * o por nombre. Si el municipio no pertenece a ese departamento, devuelve null.
 */
export function findMunicipalityInDepartment(
  departmentCodeOrName: string | null | undefined,
  municipalityCodeOrName: string | null | undefined,
): DivipolaMunicipality | null {
  const dept = findDivipolaDepartment(departmentCodeOrName);
  if (!dept || !municipalityCodeOrName || typeof municipalityCodeOrName !== 'string') {
    return null;
  }
  const trimmed = municipalityCodeOrName.trim();
  if (!trimmed) return null;

  const deptMunicipalities = MUNICIPALITIES_BY_DEPT_CODE.get(dept.code) ?? [];
  if (/^\d{5}$/.test(trimmed)) {
    return deptMunicipalities.find((m) => m.code === trimmed) ?? null;
  }

  const normTarget = normalizeDivipolaText(trimmed);
  if (dept.code === '11' && (normTarget === 'bogota' || normTarget === 'bogota d c' || normTarget === 'bogota dc')) {
    return BOGOTA_MPIO ?? null;
  }
  return deptMunicipalities.find((m) => normalizeDivipolaText(m.name) === normTarget) ?? null;
}

/**
 * Filtra departamentos por texto de búsqueda (nombre o código DIVIPOLA).
 */
export function filterDivipolaDepartments(
  departmentsList: readonly DivipolaDepartment[],
  query: string,
): DivipolaDepartment[] {
  const norm = normalizeDivipolaText(query);
  if (!norm) return [...departmentsList];
  return departmentsList.filter(
    (d) => normalizeDivipolaText(d.name).includes(norm) || d.code.startsWith(norm),
  );
}

/**
 * Filtra municipios por texto de búsqueda (nombre parcial o código DIVIPOLA).
 */
export function filterDivipolaMunicipalities(
  municipalitiesList: readonly DivipolaMunicipality[],
  query: string,
): DivipolaMunicipality[] {
  const norm = normalizeDivipolaText(query);
  if (!norm) return [...municipalitiesList];
  return municipalitiesList.filter(
    (m) => normalizeDivipolaText(m.name).includes(norm) || m.code.startsWith(norm),
  );
}

export type DivipolaResolutionStatus =
  | 'EMPTY'
  | 'RESOLVED'
  | 'RESOLVED_UNIQUE_CITY'
  | 'DEPARTMENT_ONLY'
  | 'AMBIGUOUS_CITY'
  | 'MISMATCHED_MUNICIPALITY'
  | 'UNRECOGNIZED_CITY'
  | 'UNRECOGNIZED_DEPARTMENT';

export interface DivipolaLocationResolution {
  status: DivipolaResolutionStatus;
  department: DivipolaDepartment | null;
  municipality: DivipolaMunicipality | null;
  legacyDepartment: string | null;
  legacyCity: string | null;
}

/**
 * Resuelve de forma determinista y sin adivinaciones riesgosas la ubicación de un tercero:
 * - Si tiene departamento y municipio válidos y consistentes → RESOLVED.
 * - Si solo tiene código de municipio válido (5 dígitos) → RESOLVED.
 * - Si solo tiene nombre de municipio y ese nombre es único en toda Colombia (ej. 'Montería', 'Sincelejo') → RESOLVED_UNIQUE_CITY.
 * - Si solo tiene nombre de municipio y existe en varios departamentos (ej. 'Buenavista', 'La Unión', 'San Pedro') → AMBIGUOUS_CITY (no asigna departamento automáticamente).
 * - Si el municipio pertenece a otro departamento distinto al indicado → MISMATCHED_MUNICIPALITY.
 * - Si el departamento o municipio tienen errores de escritura o nombres antiguos no reconocidos → UNRECOGNIZED_DEPARTMENT / UNRECOGNIZED_CITY.
 */
export function resolveThirdPartyDivipolaLocation(input: {
  department?: string | null;
  city?: string | null;
  departmentCode?: string | null;
  municipalityCode?: string | null;
}): DivipolaLocationResolution {
  const rawDept = input.department?.trim() || null;
  const rawCity = input.city?.trim() || null;
  const rawDeptCode = input.departmentCode?.trim() || null;
  const rawMpioCode = input.municipalityCode?.trim() || null;

  if (!rawDept && !rawCity && !rawDeptCode && !rawMpioCode) {
    return {
      status: 'EMPTY',
      department: null,
      municipality: null,
      legacyDepartment: null,
      legacyCity: null,
    };
  }

  const deptFromCode = rawDeptCode ? findDivipolaDepartment(rawDeptCode) : null;
  if (rawDeptCode && !deptFromCode) {
    return {
      status: 'UNRECOGNIZED_DEPARTMENT',
      department: null,
      municipality: null,
      legacyDepartment: rawDept ?? rawDeptCode,
      legacyCity: rawCity ?? rawMpioCode,
    };
  }

  const deptFromName = rawDept ? findDivipolaDepartment(rawDept) : null;
  if (rawDept && !deptFromName) {
    return {
      status: 'UNRECOGNIZED_DEPARTMENT',
      department: null,
      municipality: null,
      legacyDepartment: rawDept,
      legacyCity: rawCity,
    };
  }

  if (deptFromCode && deptFromName && deptFromCode.code !== deptFromName.code) {
    return {
      status: 'UNRECOGNIZED_DEPARTMENT',
      department: null,
      municipality: null,
      legacyDepartment: rawDept,
      legacyCity: rawCity,
    };
  }

  const resolvedDept = deptFromCode ?? deptFromName;

  // Caso 1: Se proporcionó departamento válido
  if (resolvedDept) {
    if (!rawCity && !rawMpioCode) {
      return {
        status: 'DEPARTMENT_ONLY',
        department: resolvedDept,
        municipality: null,
        legacyDepartment: null,
        legacyCity: null,
      };
    }

    const mpioByCode = rawMpioCode ? findDivipolaMunicipalityByCode(rawMpioCode) : null;
    if (rawMpioCode && !mpioByCode) {
      return {
        status: 'UNRECOGNIZED_CITY',
        department: resolvedDept,
        municipality: null,
        legacyDepartment: rawDept,
        legacyCity: rawCity ?? rawMpioCode,
      };
    }
    if (mpioByCode && mpioByCode.departmentCode !== resolvedDept.code) {
      return {
        status: 'MISMATCHED_MUNICIPALITY',
        department: resolvedDept,
        municipality: null,
        legacyDepartment: rawDept,
        legacyCity: rawCity ?? mpioByCode.name,
      };
    }

    const mpioInDept = rawCity
      ? findMunicipalityInDepartment(resolvedDept.code, rawCity)
      : mpioByCode;

    if (mpioInDept) {
      if (mpioByCode && mpioByCode.code !== mpioInDept.code) {
        return {
          status: 'MISMATCHED_MUNICIPALITY',
          department: resolvedDept,
          municipality: null,
          legacyDepartment: rawDept,
          legacyCity: rawCity,
        };
      }
      return {
        status: 'RESOLVED',
        department: resolvedDept,
        municipality: mpioInDept,
        legacyDepartment: null,
        legacyCity: null,
      };
    }

    // Verificar si el nombre de ciudad existe pero en otro departamento
    const normCity = normalizeDivipolaText(rawCity);
    const matchesAnywhere = MUNICIPALITIES_BY_NORMALIZED_NAME.get(normCity) ?? [];
    if (matchesAnywhere.length > 0) {
      return {
        status: 'MISMATCHED_MUNICIPALITY',
        department: resolvedDept,
        municipality: null,
        legacyDepartment: rawDept,
        legacyCity: rawCity,
      };
    }

    return {
      status: 'UNRECOGNIZED_CITY',
      department: resolvedDept,
      municipality: null,
      legacyDepartment: rawDept,
      legacyCity: rawCity,
    };
  }

  // Caso 2: No se proporcionó departamento, pero sí código o nombre de municipio
  if (rawMpioCode) {
    const mpioByCode = findDivipolaMunicipalityByCode(rawMpioCode);
    if (!mpioByCode) {
      return {
        status: 'UNRECOGNIZED_CITY',
        department: null,
        municipality: null,
        legacyDepartment: null,
        legacyCity: rawCity ?? rawMpioCode,
      };
    }
    const dept = DEPARTMENT_BY_CODE.get(mpioByCode.departmentCode) ?? null;
    if (rawCity && normalizeDivipolaText(rawCity) !== normalizeDivipolaText(mpioByCode.name)) {
      return {
        status: 'MISMATCHED_MUNICIPALITY',
        department: dept,
        municipality: null,
        legacyDepartment: null,
        legacyCity: rawCity,
      };
    }
    return {
      status: 'RESOLVED',
      department: dept,
      municipality: mpioByCode,
      legacyDepartment: null,
      legacyCity: null,
    };
  }

  const normCity = normalizeDivipolaText(rawCity);
  const matches = MUNICIPALITIES_BY_NORMALIZED_NAME.get(normCity) ?? [];
  if (matches.length === 1) {
    const mpio = matches[0];
    const dept = DEPARTMENT_BY_CODE.get(mpio.departmentCode) ?? null;
    return {
      status: 'RESOLVED_UNIQUE_CITY',
      department: dept,
      municipality: mpio,
      legacyDepartment: null,
      legacyCity: null,
    };
  }

  if (matches.length > 1) {
    return {
      status: 'AMBIGUOUS_CITY',
      department: null,
      municipality: null,
      legacyDepartment: null,
      legacyCity: rawCity,
    };
  }

  return {
    status: 'UNRECOGNIZED_CITY',
    department: null,
    municipality: null,
    legacyDepartment: null,
    legacyCity: rawCity,
  };
}
