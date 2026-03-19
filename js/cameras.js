/**
 * Tráfico Tenerife – Camera Data & URL Builder
 *
 * Fuente oficial: https://cic.tenerife.es/web3/mosaico_cctv/camaras_trafico_w.html
 * IDs extraídos directamente del HTML fuente del CIC.
 *
 * Formato de imagen:
 *   https://cic.tenerife.es/e-Traffic3/data/camara-{SERIE}-{ID}.jpg?t={timestamp}
 *
 * Dos series de cámaras:
 *   2701001 — serie original
 *   2701002 — serie ampliada (mayoría de cámaras)
 */

const CIC_BASE = 'https://cic.tenerife.es/e-Traffic3/data/';

/**
 * Construye la URL de imagen con cache-busting.
 * @param {string} camId  ID completo, p.ej. '2701001-26' o '2701002-514'
 */
function getCameraUrl(camId) {
  return `${CIC_BASE}camara-${camId}.jpg?t=${Date.now()}`;
}

/* ──────────────────────────────────────────────────────────
   GRUPOS DE CÁMARAS
   Extraídos del HTML fuente del CIC (96 cámaras en total).
   Secciones exactas del CIC, con nombres descriptivos.

   Cada cámara:
     id:   string completo → 'SERIE-NUM'  (ej: '2701001-26')
     name: nombre descriptivo de la ubicación
──────────────────────────────────────────────────────────── */
const CAMERA_GROUPS = [
  /* ── 1. ZONA NORTE ──────────────────────────────────────
     TF-5 Autopista del Norte + accesos norte de Santa Cruz
     53 cámaras                                            */
  {
    id:       'norte',
    name:     'Cámaras de TF-5 / Zona Norte',
    subtitle: 'Autopista del Norte · Santa Cruz – Puerto de la Cruz',
    icon:     '🛣',
    cameras: [
      { id: '2701001-14',  name: 'Norte · 1'           },
      { id: '2701001-6',   name: 'Norte · 2'           },
      { id: '2701001-21',  name: 'Norte · 3'           },
      { id: '2701001-22',  name: 'Norte · 4'           },
      { id: '2701001-27',  name: 'Norte · 5'           },
      { id: '2701001-28',  name: 'Norte · 6'           },
      { id: '2701001-26',  name: 'Norte · 7'           },
      { id: '2701001-29',  name: 'Norte · 8'           },
      { id: '2701001-30',  name: 'Norte · 9'           },
      { id: '2701002-1020',name: 'Norte · 10'          },
      { id: '2701001-31',  name: 'Norte · 11'          },
      { id: '2701001-40',  name: 'Norte · 12'          },
      { id: '2701001-41',  name: 'Norte · 13'          },
      { id: '2701002-514', name: 'Norte · 14'          },
      { id: '2701002-131', name: 'Norte · 15'          },
      { id: '2701001-70',  name: 'Norte · 16'          },
      { id: '2701002-516', name: 'TF-5 · pk A1'        },
      { id: '2701002-517', name: 'TF-5 · pk B1'        },
      { id: '2701002-519', name: 'TF-5 · pk A2'        },
      { id: '2701002-520', name: 'TF-5 · pk B2'        },
      { id: '2701002-521', name: 'TF-5 · pk A3'        },
      { id: '2701002-522', name: 'TF-5 · pk B3'        },
      { id: '2701002-523', name: 'TF-5 · pk A4'        },
      { id: '2701002-525', name: 'TF-5 · pk B4'        },
      { id: '2701002-524', name: 'TF-5 · pk A5'        },
      { id: '2701002-527', name: 'TF-5 · pk B5'        },
      { id: '2701002-526', name: 'TF-5 · pk A6'        },
      { id: '2701002-529', name: 'TF-5 · pk B6'        },
      { id: '2701002-528', name: 'TF-5 · pk A7'        },
      { id: '2701002-531', name: 'TF-5 · pk B7'        },
      { id: '2701002-530', name: 'TF-5 · pk A8'        },
      { id: '2701002-533', name: 'TF-5 · pk B8'        },
      { id: '2701002-532', name: 'TF-5 · pk A9'        },
      { id: '2701002-535', name: 'TF-5 · pk B9'        },
      { id: '2701002-534', name: 'TF-5 · pk A10'       },
      { id: '2701002-537', name: 'TF-5 · pk B10'       },
      { id: '2701002-536', name: 'TF-5 · pk A11'       },
      { id: '2701002-539', name: 'TF-5 · pk B11'       },
      { id: '2701002-538', name: 'TF-5 · pk A12'       },
      { id: '2701002-541', name: 'TF-5 · pk B12'       },
      { id: '2701002-540', name: 'TF-5 · pk A13'       },
      { id: '2701002-543', name: 'TF-5 · pk B13'       },
      { id: '2701002-542', name: 'TF-5 · pk A14'       },
      { id: '2701002-545', name: 'TF-5 · pk B14'       },
      { id: '2701002-544', name: 'TF-5 · pk A15'       },
      { id: '2701002-546', name: 'TF-5 · pk B15'       },
      { id: '2701002-547', name: 'TF-5 · pk A16'       },
      { id: '2701002-548', name: 'TF-5 · pk B16'       },
      { id: '2701002-549', name: 'TF-5 · pk A17'       },
      { id: '2701002-551', name: 'TF-5 · pk B17'       },
      { id: '2701002-550', name: 'TF-5 · pk A18'       },
      { id: '2701002-552', name: 'TF-5 · pk B18'       },
      { id: '2701002-553', name: 'TF-5 · pk 19'        },
    ]
  },

  /* ── 2. ZONA SUR ────────────────────────────────────────
     TF-1 Autopista del Sur
     21 cámaras                                           */
  {
    id:       'sur',
    name:     'Cámaras de TF-1 / Zona Sur',
    subtitle: 'Autopista del Sur · Santa Cruz – Los Cristianos',
    icon:     '🛣',
    cameras: [
      { id: '2701001-49',   name: 'TF-1 · Sur 1'     },
      { id: '2701001-50',   name: 'TF-1 · Sur 2'     },
      { id: '2701001-52',   name: 'TF-1 · Sur 3'     },
      { id: '2701001-53',   name: 'TF-1 · Sur 4'     },
      { id: '2701001-62',   name: 'TF-1 · Sur 5'     },
      { id: '2701001-63',   name: 'TF-1 · Sur 6'     },
      { id: '2701002-1002', name: 'TF-1 · pk A1'     },
      { id: '2701002-1004', name: 'TF-1 · pk B1'     },
      { id: '2701002-1006', name: 'TF-1 · pk A2'     },
      { id: '2701002-1008', name: 'TF-1 · pk B2'     },
      { id: '2701002-1010', name: 'TF-1 · pk A3'     },
      { id: '2701002-1012', name: 'TF-1 · pk B3'     },
      { id: '2701002-1014', name: 'TF-1 · pk A4'     },
      { id: '2701002-1016', name: 'TF-1 · pk B4'     },
      { id: '2701002-1022', name: 'TF-1 · pk A5'     },
      { id: '2701002-1024', name: 'TF-1 · pk B5'     },
      { id: '2701002-1026', name: 'TF-1 · pk A6'     },
      { id: '2701002-1028', name: 'TF-1 · pk B6'     },
      { id: '2701002-1030', name: 'TF-1 · pk A7'     },
      { id: '2701002-1032', name: 'TF-1 · pk B7'     },
      { id: '2701002-1034', name: 'TF-1 · pk 8'      },
    ]
  },

  /* ── 3. ENLACE TF-2 ─────────────────────────────────────
     TF-2 · Santa María del Mar → Túneles de Chumberas
     10 cámaras                                           */
  {
    id:       'tf2',
    name:     'Cámaras de TF-2',
    subtitle: 'Enlace Santa María del Mar – Túneles de Chumberas',
    icon:     '🏙',
    cameras: [
      { id: '2701002-211', name: 'TF-2 · Sta. María 1'  },
      { id: '2701002-212', name: 'TF-2 · Sta. María 2'  },
      { id: '2701002-213', name: 'TF-2 · Sta. María 3'  },
      { id: '2701002-214', name: 'TF-2 · Sta. María 4'  },
      { id: '2701002-215', name: 'TF-2 · Sta. María 5'  },
      { id: '2701002-216', name: 'TF-2 · Sta. María 6'  },
      { id: '2701001-39',  name: 'TF-2 · Chumberas 1'   },
      { id: '2701001-38',  name: 'TF-2 · Chumberas 2'   },
      { id: '2701001-35',  name: 'TF-2 · Chumberas 3'   },
      { id: '2701001-32',  name: 'TF-2 · Chumberas 4'   },
    ]
  },

  /* ── 4. TÚNEL VÍA LITORAL ───────────────────────────────
     4 cámaras                                            */
  {
    id:       'tun-litoral',
    name:     'Túnel de la Vía Litoral',
    subtitle: 'Cámaras interiores y accesos',
    icon:     '🔆',
    cameras: [
      { id: '2701002-911', name: 'Vía Litoral · 1'  },
      { id: '2701002-903', name: 'Vía Litoral · 2'  },
      { id: '2701002-908', name: 'Vía Litoral · 3'  },
      { id: '2701002-912', name: 'Vía Litoral · 4'  },
    ]
  },

  /* ── 5. TÚNEL DE LA VEGA ────────────────────────────────
     4 cámaras                                            */
  {
    id:       'tun-vega',
    name:     'Túnel de la Vega',
    subtitle: 'Cámaras interiores y accesos',
    icon:     '🔆',
    cameras: [
      { id: '2701002-717', name: 'Tún. Vega · 1'    },
      { id: '2701002-715', name: 'Tún. Vega · 2'    },
      { id: '2701002-701', name: 'Tún. Vega · 3'    },
      { id: '2701002-716', name: 'Tún. Vega · 4'    },
    ]
  },

  /* ── 6. TÚNEL DEL BICHO ─────────────────────────────────
     2 cámaras                                            */
  {
    id:       'tun-bicho',
    name:     'Túnel del Bicho',
    subtitle: 'Cámaras interiores y accesos',
    icon:     '🔆',
    cameras: [
      { id: '2701002-823', name: 'Tún. Bicho · 1'   },
      { id: '2701002-824', name: 'Tún. Bicho · 2'   },
    ]
  },

  /* ── 7. TÚNEL DEL GUINCHO ───────────────────────────────
     2 cámaras                                            */
  {
    id:       'tun-guincho',
    name:     'Túnel del Guincho',
    subtitle: 'Cámaras interiores y accesos',
    icon:     '🔆',
    cameras: [
      { id: '2701002-421', name: 'Tún. Guincho · 1' },
      { id: '2701002-422', name: 'Tún. Guincho · 2' },
    ]
  },
];
