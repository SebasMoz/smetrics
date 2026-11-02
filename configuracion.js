// =====================================================================
//  CONFIGURACIÓN PERSONAL DE SMETRICS
// =====================================================================
//  Aquí están tus datos de pulso. La app los usa para calcular las zonas
//  cuando el archivo no las trae (por ejemplo, los archivos del Wahoo).
//
//  Puedes cambiar los NÚMEROS con el Bloc de notas. No borres comas,
//  llaves { } ni corchetes [ ].
//
//  "zonas" = el pulso donde EMPIEZA cada zona, en este orden:
//     [ Z1, Z2, Z3, Z4, Z5, por encima del máximo ]
//  Ejemplo: con 143 en Z2, un pulso de 143 ya cuenta como Z2 (igual que Garmin).
//
//  Valores iniciales copiados de tu Garmin Forerunner 265 (septiembre 2026).
// =====================================================================

window.CONFIGURACION = {
  correr: {
    umbral: 174,   // pulso de umbral (ppm)
    maximo: 193,   // pulso máximo (ppm)
    zonas: [116, 143, 158, 170, 179, 193],
  },

  // En bici el umbral suele ser 5 a 10 ppm más bajo que corriendo.
  // Por ahora usa los mismos valores de correr; cámbialos cuando los conozcas.
  bici: {
    umbral: 174,
    maximo: 193,
    zonas: [116, 143, 158, 170, 179, 193],
  },
};
