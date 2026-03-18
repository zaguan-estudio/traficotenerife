/**
 * Tráfico Tenerife – Camera Data & URL Builder
 *
 * Camera images are sourced from the official CIC Tenerife server:
 * https://cic.tenerife.es/web3/mosaico_cctv/camaras_trafico_w.html
 *
 * The app will attempt to discover live camera image URLs automatically
 * by parsing the CIC page. The static entries below serve as the
 * authoritative list of camera names and groupings, with multiple
 * candidate URL patterns that are tried in order.
 *
 * HOW TO UPDATE CAMERA IDs:
 * 1. Open https://cic.tenerife.es/web3/mosaico_cctv/camaras_trafico_w.html in a browser
 * 2. Open DevTools → Network → filter by "img" or ".jpg"
 * 3. Copy the image URL patterns and update the `ids` array for each camera
 */

const CIC_BASE = 'https://cic.tenerife.es/web3/mosaico_cctv/';

// Candidate URL builders tried in sequence until image loads
const URL_BUILDERS = [
  id => `${CIC_BASE}${id}.jpg`,
  id => `${CIC_BASE}images/${id}.jpg`,
  id => `${CIC_BASE}cam/${id}.jpg`,
  id => `${CIC_BASE}${id}.jpeg`,
  id => `${CIC_BASE}webcam.php?cam=${id}`,
  id => `${CIC_BASE}imagen.php?id=${id}`,
];

/**
 * Returns the primary candidate URL for a camera ID.
 * A cache-busting timestamp is appended.
 */
function getCameraUrl(camId, urlIndex = 0) {
  const builder = URL_BUILDERS[urlIndex % URL_BUILDERS.length];
  const base = builder(camId);
  return `${base}${base.includes('?') ? '&' : '?'}t=${Date.now()}`;
}

/* ──────────────────────────────────────────────────────────
   CAMERA GROUPS
   Cameras are grouped by road, matching the structure of
   http://www.traficotenerife.com/index_cams.html

   Each camera entry has:
   - id:   Identifier used to build the image URL (update to match CIC)
   - name: Human-readable display name
──────────────────────────────────────────────────────────── */
const CAMERA_GROUPS = [
  {
    id:       'tf5',
    name:     'Cámaras de TF-5',
    subtitle: 'Autopista del Norte · Santa Cruz ↔ Puerto de la Cruz',
    icon:     '🛣️',
    cameras: [
      { id: 'tf5_entr_tun',       name: 'Entrada Túnel 3 de Mayo'    },
      { id: 'tf5_tun3mayo',       name: 'Túnel 3 de Mayo'            },
      { id: 'tf5_3mayo',          name: 'TF-5 · 3 de Mayo'           },
      { id: 'tf5_sal_tun',        name: 'Salida Túnel 3 de Mayo'     },
      { id: 'tf5_somosierra',     name: 'TF-5 · Somosierra'          },
      { id: 'tf5_residencia',     name: 'TF-5 · Residencia'          },
      { id: 'tf5_taco',           name: 'TF-5 · Taco'                },
      { id: 'tf5_chumberas',      name: 'TF-5 · Chumberas'           },
      { id: 'tf5_guajara',        name: 'TF-5 · Guajara'             },
      { id: 'tf5_padre_anchieta', name: 'TF-5 · Padre Anchieta'      },
      { id: 'tf5_san_benito',     name: 'TF-5 · San Benito'          },
      { id: 'tf5_los_rodeos',     name: 'TF-5 · Los Rodeos'          },
      { id: 'tf5_tacoronte',      name: 'TF-5 · Tacoronte'           },
      { id: 'tf5_sta_ursula',     name: 'TF-5 · Sta. Úrsula'         },
      { id: 'tf5_pto_la_cruz',    name: 'TF-5 · Puerto de la Cruz'   },
    ]
  },
  {
    id:       'tf1',
    name:     'Cámaras de TF-1',
    subtitle: 'Autopista del Sur · Santa Cruz ↔ Los Cristianos',
    icon:     '🛣️',
    cameras: [
      { id: 'tf1_rec_ferial',      name: 'TF-1 · Rotonda Recinto Ferial' },
      { id: 'tf1_falso_tun',       name: 'TF-1 · Falso Túnel'            },
      { id: 'tf1_radazul',         name: 'TF-1 · Radazul'                },
      { id: 'tf1_tabaiba',         name: 'TF-1 · Tabaiba'                },
      { id: 'tf1_bco_hondo',       name: 'TF-1 · Barranco Hondo'         },
      { id: 'tf1_caletillas',      name: 'TF-1 · Caletillas'             },
      { id: 'tf1_candelaria',      name: 'TF-1 · Candelaria'             },
      { id: 'tf1_guimar',          name: 'TF-1 · Güímar'                 },
      { id: 'tf1_fasnia',          name: 'TF-1 · Fasnia'                 },
      { id: 'tf1_pguimar',         name: 'TF-1 · Puertito de Güímar'     },
      { id: 'tf1_el_medano',       name: 'TF-1 · El Médano'              },
      { id: 'tf1_granadilla',      name: 'TF-1 · Granadilla de Abona'    },
      { id: 'tf1_los_abrigos',     name: 'TF-1 · Los Abrigos'            },
      { id: 'tf1_las_galletas',    name: 'TF-1 · Las Galletas'           },
    ]
  },
  {
    id:       'tf13',
    name:     'Cámaras de TF-13',
    subtitle: 'Vía de Circunvalación de Santa Cruz',
    icon:     '🔄',
    cameras: [
      { id: 'tf13_entrada_n',     name: 'TF-13 · Entrada Norte'      },
      { id: 'tf13_paso_alto',     name: 'TF-13 · Paso Alto'          },
      { id: 'tf13_ofra',          name: 'TF-13 · Ofra'               },
      { id: 'tf13_el_chorrillo',  name: 'TF-13 · El Chorrillo'       },
      { id: 'tf13_la_gallega',    name: 'TF-13 · La Gallega'         },
      { id: 'tf13_bco_santos',    name: 'TF-13 · Barranco Santos'    },
      { id: 'tf13_salida_s',      name: 'TF-13 · Salida Sur'         },
    ]
  },
  {
    id:       'tf2',
    name:     'Cámaras de TF-2',
    subtitle: 'Autovía Metropolitana',
    icon:     '🏙️',
    cameras: [
      { id: 'tf2_sta_maria',      name: 'TF-2 · Sta. María del Mar'  },
      { id: 'tf2_chumberas',      name: 'TF-2 · Chumberas'           },
      { id: 'tf2_taco',           name: 'TF-2 · Taco'                },
      { id: 'tf2_la_laguna',      name: 'TF-2 · La Laguna'           },
      { id: 'tf2_bco_hondo',      name: 'TF-2 · Bco. Hondo'         },
      { id: 'tf2_estadio',        name: 'TF-2 · Estadio Heliodoro'   },
    ]
  },
  {
    id:       'noreste',
    name:     'Cámaras de Noreste',
    subtitle: 'Zona Noreste de la Isla',
    icon:     '🌿',
    cameras: [
      { id: 'ne_tacoronte',       name: 'Noreste · Tacoronte'         },
      { id: 'ne_el_sauzal',       name: 'Noreste · El Sauzal'         },
      { id: 'ne_la_victoria',     name: 'Noreste · La Victoria'       },
      { id: 'ne_sta_ursula',      name: 'Noreste · Sta. Úrsula'       },
      { id: 'ne_la_matanza',      name: 'Noreste · La Matanza'        },
    ]
  },
  {
    id:       'staCruz',
    name:     'Cámaras de Sta. Cruz',
    subtitle: 'Zona Urbana de Santa Cruz de Tenerife',
    icon:     '🏛️',
    cameras: [
      { id: 'sc_av_constitucion', name: 'Avda. de la Constitución'   },
      { id: 'sc_av_3mayo',        name: 'Avda. Tres de Mayo'         },
      { id: 'sc_rec_ferial',      name: 'Recinto Ferial'             },
      { id: 'sc_la_salle',        name: 'La Salle'                   },
      { id: 'sc_av_maritima',     name: 'Avda. Marítima'             },
      { id: 'sc_el_pilar',        name: 'El Pilar'                   },
      { id: 'sc_casa_roja',       name: 'Casa Roja'                  },
      { id: 'sc_wu_tang',         name: 'Añaza / Wu Tang'            },
    ]
  }
];
