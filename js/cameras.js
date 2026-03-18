/**
 * Tráfico Tenerife – Camera Data & URL Builder
 *
 * Imágenes obtenidas de la fuente oficial del CIC Tenerife:
 *   https://cic.tenerife.es/e-Traffic3/data/camara-2701001-{N}.jpg
 *
 * El parámetro ?t= se añade para evitar caché del navegador.
 *
 * CÓMO ACTUALIZAR LOS IDs:
 *   1. Abre https://cic.tenerife.es/web3/mosaico_cctv/camaras_trafico_w.html
 *   2. F12 → Red → filtra por "jpg"
 *   3. Recarga y copia los números finales de cada URL (ej: camara-2701001-26 → num: 26)
 *   4. Actualiza el campo `num` de cada cámara en CAMERA_GROUPS
 *   5. O usa el Modo Escáner integrado (botón "🔍 Explorar IDs") para descubrirlos
 */

const CIC_BASE   = 'https://cic.tenerife.es/e-Traffic3/data/';
const CAM_SERIES = '2701001';  // Prefijo fijo de la serie de cámaras

/**
 * Construye la URL de imagen de una cámara con cache-busting.
 * @param {number|string} camNum  Número secuencial de cámara (ej: 26)
 */
function getCameraUrl(camNum) {
  return `${CIC_BASE}camara-${CAM_SERIES}-${camNum}.jpg?t=${Date.now()}`;
}

/* ──────────────────────────────────────────────────────────
   GRUPOS DE CÁMARAS
   Agrupadas por carretera, equivalente a la estructura de
   http://www.traficotenerife.com/index_cams.html

   Cada cámara tiene:
     - num:  Número secuencial del sistema CIC (parte final de la URL)
     - name: Nombre descriptivo de la ubicación

   NOTA: Los `num` están asignados de forma secuencial aproximada
   basándose en las cámaras confirmadas (26 y 27 en rango TF-1).
   Usa el Modo Escáner para confirmar cuáles IDs tienen imagen activa.
──────────────────────────────────────────────────────────── */
const CAMERA_GROUPS = [
  {
    id:       'tf5',
    name:     'Cámaras de TF-5',
    subtitle: 'Autopista del Norte · Santa Cruz ↔ Puerto de la Cruz',
    icon:     '🛣',
    cameras: [
      { num:  1, name: 'Entrada Túnel 3 de Mayo'  },
      { num:  2, name: 'Túnel 3 de Mayo'          },
      { num:  3, name: 'TF-5 · 3 de Mayo'         },
      { num:  4, name: 'Salida Túnel 3 de Mayo'   },
      { num:  5, name: 'TF-5 · Somosierra'        },
      { num:  6, name: 'TF-5 · Residencia'        },
      { num:  7, name: 'TF-5 · Taco'              },
      { num:  8, name: 'TF-5 · Chumberas'         },
      { num:  9, name: 'TF-5 · Guajara'           },
      { num: 10, name: 'TF-5 · Padre Anchieta'    },
      { num: 11, name: 'TF-5 · San Benito'        },
      { num: 12, name: 'TF-5 · Los Rodeos'        },
      { num: 13, name: 'TF-5 · Tacoronte'         },
      { num: 14, name: 'TF-5 · Sta. Úrsula'       },
      { num: 15, name: 'TF-5 · Puerto de la Cruz' },
    ]
  },
  {
    id:       'tf1',
    name:     'Cámaras de TF-1',
    subtitle: 'Autopista del Sur · Santa Cruz ↔ Los Cristianos',
    icon:     '🛣',
    cameras: [
      { num: 16, name: 'TF-1 · Rotonda Recinto Ferial' },
      { num: 17, name: 'TF-1 · Falso Túnel'            },
      { num: 18, name: 'TF-1 · Radazul'                },
      { num: 19, name: 'TF-1 · Tabaiba'                },
      { num: 20, name: 'TF-1 · Barranco Hondo'         },
      { num: 21, name: 'TF-1 · Caletillas'             },
      { num: 22, name: 'TF-1 · Candelaria'             },
      { num: 23, name: 'TF-1 · Güímar'                 },
      { num: 24, name: 'TF-1 · Fasnia'                 },
      { num: 25, name: 'TF-1 · Puertito de Güímar'     },
      { num: 26, name: 'TF-1 · El Médano'              },
      { num: 27, name: 'TF-1 · Granadilla de Abona'    },
      { num: 28, name: 'TF-1 · Los Abrigos'            },
      { num: 29, name: 'TF-1 · Las Galletas'           },
    ]
  },
  {
    id:       'tf13',
    name:     'Cámaras de TF-13',
    subtitle: 'Vía de Circunvalación de Santa Cruz',
    icon:     '🔄',
    cameras: [
      { num: 30, name: 'TF-13 · Entrada Norte'    },
      { num: 31, name: 'TF-13 · Paso Alto'        },
      { num: 32, name: 'TF-13 · Ofra'             },
      { num: 33, name: 'TF-13 · El Chorrillo'     },
      { num: 34, name: 'TF-13 · La Gallega'       },
      { num: 35, name: 'TF-13 · Barranco Santos'  },
      { num: 36, name: 'TF-13 · Salida Sur'       },
    ]
  },
  {
    id:       'tf2',
    name:     'Cámaras de TF-2',
    subtitle: 'Autovía Metropolitana',
    icon:     '🏙',
    cameras: [
      { num: 37, name: 'TF-2 · Sta. María del Mar' },
      { num: 38, name: 'TF-2 · Chumberas'          },
      { num: 39, name: 'TF-2 · Taco'               },
      { num: 40, name: 'TF-2 · La Laguna'          },
      { num: 41, name: 'TF-2 · Bco. Hondo'         },
      { num: 42, name: 'TF-2 · Estadio Heliodoro'  },
    ]
  },
  {
    id:       'noreste',
    name:     'Cámaras de Noreste',
    subtitle: 'Zona Noreste de la Isla',
    icon:     '🌿',
    cameras: [
      { num: 43, name: 'Noreste · Tacoronte'       },
      { num: 44, name: 'Noreste · El Sauzal'       },
      { num: 45, name: 'Noreste · La Victoria'     },
      { num: 46, name: 'Noreste · Sta. Úrsula'     },
      { num: 47, name: 'Noreste · La Matanza'      },
    ]
  },
  {
    id:       'staCruz',
    name:     'Cámaras de Sta. Cruz',
    subtitle: 'Zona Urbana de Santa Cruz de Tenerife',
    icon:     '🏛',
    cameras: [
      { num: 48, name: 'Avda. de la Constitución' },
      { num: 49, name: 'Avda. Tres de Mayo'       },
      { num: 50, name: 'Recinto Ferial'           },
      { num: 51, name: 'La Salle'                 },
      { num: 52, name: 'Avda. Marítima'           },
      { num: 53, name: 'El Pilar'                 },
      { num: 54, name: 'Casa Roja'                },
      { num: 55, name: 'Añaza'                    },
    ]
  }
];
