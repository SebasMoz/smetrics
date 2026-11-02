// SMetrics — lee un archivo .FIT arrastrado y muestra el análisis.
// Todo ocurre en el navegador: nada se envía a internet y nada se guarda.

"use strict";

const zonaSoltar = document.getElementById("zonaSoltar");
const analisis = document.getElementById("analisis");
const mensajeError = document.getElementById("mensajeError");
const botonOtro = document.getElementById("botonOtro");

let graficasActivas = [];

// ---------- Recibir el archivo ----------

// Evita que Chrome abra el archivo si se suelta fuera de la zona.
["dragover", "drop"].forEach((ev) =>
  window.addEventListener(ev, (e) => e.preventDefault())
);

window.addEventListener("dragover", () => zonaSoltar.classList.add("encima"));
window.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) zonaSoltar.classList.remove("encima");
});
window.addEventListener("drop", (e) => {
  zonaSoltar.classList.remove("encima");
  const archivo = e.dataTransfer.files[0];
  if (archivo) abrirArchivo(archivo);
});

for (const id of ["inputArchivo", "inputArchivo2"]) {
  document.getElementById(id).addEventListener("change", (e) => {
    const archivo = e.target.files[0];
    if (archivo) abrirArchivo(archivo);
    e.target.value = "";
  });
}

async function abrirArchivo(archivo) {
  try {
    abrirBytes(await archivo.arrayBuffer(), archivo.name);
  } catch (err) {
    console.error(err);
    mostrarError(err.message);
  }
}

// También lo usa drive.js, con el archivo bajado de Google Drive.
function abrirBytes(bytes, nombre) {
  mostrarAnalisis(leerFit(bytes), nombre);
}
window.abrirBytes = abrirBytes;

function mostrarError(texto) {
  analisis.hidden = true;
  botonOtro.hidden = true;
  zonaSoltar.hidden = false;
  mensajeError.textContent = texto;
  mensajeError.hidden = false;
}

// ---------- Leer el .FIT con la librería de Garmin ----------

function leerFit(bytes) {
  const { Decoder, Stream } = window.FitSDK;
  const decoder = new Decoder(Stream.fromArrayBuffer(bytes));
  if (!decoder.isFIT()) {
    throw new Error("Este archivo no parece ser un .FIT de entrenamiento. Revisa que sea el archivo correcto.");
  }
  const { messages, errors } = decoder.read();
  if (errors.length) console.warn("Avisos al leer el archivo:", errors);

  const registros = (messages.recordMesgs || []).filter((r) => r.timestamp);
  if (!registros.length) {
    throw new Error("El archivo se leyó, pero no trae datos de un entrenamiento (puede ser otro tipo de archivo del reloj).");
  }

  return {
    sesion: (messages.sessionMesgs || [])[0] || {},
    registros,
    vueltas: messages.lapMesgs || [],
    zonas: (messages.timeInZoneMesgs || []).find((z) => z.referenceMesg === "session"),
    dispositivo: (messages.fileIdMesgs || [])[0] || {},
    deporte: (messages.sportMesgs || [])[0] || {},
  };
}

// ---------- Preparar los datos ----------

const GRADOS = 180 / 2 ** 31; // el .FIT guarda las coordenadas en "semicírculos"

function prepararPuntos(registros) {
  const inicio = registros[0].timestamp.getTime();
  return registros.map((r) => ({
    t: (r.timestamp.getTime() - inicio) / 1000,
    km: r.distance != null ? r.distance / 1000 : null,
    vel: r.enhancedSpeed ?? r.speed ?? null, // metros por segundo
    alt: r.enhancedAltitude ?? r.altitude ?? null,
    fc: r.heartRate ?? null,
    pot: r.power ?? null,
    cad: r.cadence != null ? r.cadence + (r.fractionalCadence || 0) : null,
    lat: r.positionLat != null ? r.positionLat * GRADOS : null,
    lon: r.positionLong != null ? r.positionLong * GRADOS : null,
  }));
}

function promedio(valores) {
  const v = valores.filter((x) => x != null && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function maximo(valores) {
  const v = valores.filter((x) => x != null);
  return v.length ? Math.max(...v) : null;
}

// Suaviza una serie con un promedio móvil de "ventana" puntos.
function suavizar(valores, ventana) {
  const mitad = Math.floor(ventana / 2);
  return valores.map((_, i) => promedio(valores.slice(Math.max(0, i - mitad), i + mitad + 1)));
}

// ---------- Formatos ----------

function duracion(seg) {
  if (seg == null) return "—";
  seg = Math.round(seg);
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  const dos = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`;
}

function ritmo(metrosPorSeg) {
  if (!metrosPorSeg || metrosPorSeg < 0.5) return "—";
  return duracion(1000 / metrosPorSeg);
}

function numero(valor, decimales = 0) {
  if (valor == null || Number.isNaN(valor)) return "—";
  return valor.toLocaleString("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

const NOMBRES_DEPORTE = {
  running: "Carrera", cycling: "Ciclismo", walking: "Caminata", hiking: "Senderismo",
  swimming: "Natación", training: "Entrenamiento", trailRunning: "Trail",
};

// Convierte el código del aparato (ej. "fr265Small") en un nombre legible.
function nombreAparato(d) {
  if (d.garminProduct) {
    const fr = /^fr(\d+)(Small)?$/.exec(d.garminProduct);
    if (fr) return `Garmin Forerunner ${fr[1]}${fr[2] ? "S" : ""}`;
    return `Garmin ${d.garminProduct}`;
  }
  if (/wahoo/i.test(d.manufacturer || "")) return "Wahoo";
  return d.manufacturer || "";
}

// ---------- Mostrar ----------

function mostrarAnalisis(act, nombreArchivo) {
  const { sesion, registros } = act;
  const puntos = prepararPuntos(registros);
  const esCarrera = ["running", "walking", "hiking"].includes(sesion.sport);

  const inicio = sesion.startTime || registros[0].timestamp;
  const distanciaKm = (sesion.totalDistance ?? registros.at(-1).distance ?? 0) / 1000;
  const tiempoMov = sesion.totalTimerTime ?? puntos.at(-1).t;
  const velMedia = sesion.enhancedAvgSpeed ?? sesion.avgSpeed ?? (distanciaKm * 1000) / tiempoMov;

  // Encabezado
  document.getElementById("deporte").textContent =
    NOMBRES_DEPORTE[sesion.sport] || act.deporte.name || sesion.sport || "Actividad";
  const fecha = inicio.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hora = inicio.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  document.getElementById("titulo").textContent = fecha.charAt(0).toUpperCase() + fecha.slice(1);
  const aparato = nombreAparato(act.dispositivo);
  document.getElementById("subtitulo").textContent =
    `${hora} · ${aparato ? aparato + " · " : ""}${nombreArchivo}`;

  // Tarjetas principales
  const tarjetas = [
    ["Distancia", numero(distanciaKm, 2), "km"],
    ["Tiempo en movimiento", duracion(tiempoMov), ""],
    esCarrera
      ? ["Ritmo medio", ritmo(velMedia), "/km"]
      : ["Velocidad media", numero(velMedia * 3.6, 1), "km/h"],
    ["Pulso medio", numero(sesion.avgHeartRate ?? promedio(puntos.map((p) => p.fc))), "ppm"],
    ["Pulso máximo", numero(sesion.maxHeartRate ?? maximo(puntos.map((p) => p.fc))), "ppm"],
    ["Desnivel positivo", numero(sesion.totalAscent), "m"],
    ["Calorías", numero(sesion.totalCalories), "kcal"],
  ];
  if (sesion.avgPower != null) tarjetas.push(["Potencia media", numero(sesion.avgPower), "W"]);
  if (sesion.avgCadence != null) {
    // En carrera el reloj guarda "pasos de una pierna"; se multiplica por 2 para pasos por minuto.
    tarjetas.push(esCarrera
      ? ["Cadencia media", numero((sesion.avgCadence + (sesion.avgFractionalCadence || 0)) * 2), "pasos/min"]
      : ["Cadencia media", numero(sesion.avgCadence), "rpm"]);
  }
  if (sesion.totalTrainingEffect != null) tarjetas.push(["Efecto aeróbico", numero(sesion.totalTrainingEffect, 1), "/ 5"]);
  pintarTarjetas("tarjetas", tarjetas);

  pintarRuta(puntos);
  pintarZonas(act.zonas, puntos, sesion.sport === "cycling");
  pintarGraficas(puntos, esCarrera);
  pintarParciales(puntos, esCarrera);
  pintarExtra(sesion, esCarrera);

  zonaSoltar.hidden = true;
  mensajeError.hidden = true;
  analisis.hidden = false;
  botonOtro.hidden = false;
  window.scrollTo(0, 0);
}

function pintarTarjetas(idContenedor, lista) {
  const cont = document.getElementById(idContenedor);
  cont.innerHTML = "";
  for (const [etiqueta, valor, unidad] of lista) {
    const div = document.createElement("div");
    div.className = "tarjeta";
    div.innerHTML = `<div class="etiqueta"></div><div class="valor"><span></span><span class="unidad"></span></div>`;
    div.querySelector(".etiqueta").textContent = etiqueta;
    div.querySelector(".valor span").textContent = valor;
    div.querySelector(".unidad").textContent = valor === "—" ? "" : unidad;
    cont.appendChild(div);
  }
}

// Dibuja la forma del recorrido con las coordenadas GPS (sin mapa de fondo,
// porque los mapas necesitan internet).
function pintarRuta(puntos) {
  const cont = document.getElementById("ruta");
  const gps = puntos.filter((p) => p.lat != null && p.lon != null);
  if (gps.length < 2) {
    cont.innerHTML = `<p class="sin-datos">Esta actividad no tiene GPS (por ejemplo, en rodillo o caminadora).</p>`;
    return;
  }
  const latMedia = promedio(gps.map((p) => p.lat));
  const escalaLon = Math.cos((latMedia * Math.PI) / 180);
  const xs = gps.map((p) => p.lon * escalaLon);
  const ys = gps.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const ancho = 400, alto = 260, margen = 12;
  const escala = Math.min((ancho - 2 * margen) / (maxX - minX || 1), (alto - 2 * margen) / (maxY - minY || 1));
  const offX = (ancho - (maxX - minX) * escala) / 2;
  const offY = (alto - (maxY - minY) * escala) / 2;
  const px = (i) => ((xs[i] - minX) * escala + offX).toFixed(1);
  const py = (i) => ((ys[i] - minY) * escala + offY).toFixed(1);
  const d = xs.map((_, i) => `${i ? "L" : "M"}${px(i)},${py(i)}`).join("");
  const n = xs.length - 1;
  cont.innerHTML = `
    <svg viewBox="0 0 ${ancho} ${alto}">
      <path d="${d}" fill="none" stroke="var(--acento)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${px(0)}" cy="${py(0)}" r="6" fill="#2fa84f" stroke="var(--panel)" stroke-width="2"><title>Inicio</title></circle>
      <circle cx="${px(n)}" cy="${py(n)}" r="6" fill="var(--texto)" stroke="var(--panel)" stroke-width="2"><title>Final</title></circle>
    </svg>`;
}

// Si el archivo trae las zonas (Garmin), se usan tal cual.
// Si no (Wahoo), se calculan con el pulso segundo a segundo y configuracion.js.
function pintarZonas(zonasArchivo, puntos, esBici) {
  const cont = document.getElementById("zonas");
  const nota = document.getElementById("notaZonas");
  let limites, tiempos;

  if (zonasArchivo && zonasArchivo.timeInHrZone && zonasArchivo.hrZoneHighBoundary) {
    limites = zonasArchivo.hrZoneHighBoundary;
    tiempos = zonasArchivo.timeInHrZone;
    nota.textContent = "Zonas según tu reloj.";
  } else {
    const config = window.CONFIGURACION && window.CONFIGURACION[esBici ? "bici" : "correr"];
    if (!config || !Array.isArray(config.zonas) || !puntos.some((p) => p.fc)) {
      cont.innerHTML = `<p class="sin-datos">${puntos.some((p) => p.fc)
        ? "No se encontró el archivo configuracion.js con tus zonas de pulso."
        : "Esta actividad no tiene datos de pulso."}</p>`;
      nota.textContent = "";
      return;
    }
    limites = config.zonas;
    tiempos = calcularTiempoEnZonas(puntos, limites);
    nota.textContent = `Calculado por SMetrics con tus zonas de ${esBici ? "bici" : "correr"} (archivo configuracion.js).`;
  }

  const colores = ["#9aa3ad", "#5b9bd5", "#3fae6a", "#f0b030", "#f07b30", "#e0344b", "#a0182b"];
  const total = tiempos.reduce((a, b) => a + (b || 0), 0);
  cont.innerHTML = "";
  tiempos.forEach((seg, i) => {
    if (i === tiempos.length - 1 && !seg) return; // por encima del máximo: solo si hubo tiempo
    const desde = i === 0 ? null : limites[i - 1];
    const hasta = limites[i] != null ? limites[i] - 1 : null;
    let nombre;
    if (i === 0) nombre = `Bajo · <${limites[0]}`;
    else if (hasta == null) nombre = `Sobre máx · ≥${desde}`;
    else nombre = `Z${i} · ${desde}–${hasta}`;
    const pct = total ? ((seg || 0) / total) * 100 : 0;
    const fila = document.createElement("div");
    fila.className = "zona-fila";
    fila.innerHTML = `<span></span><div class="zona-barra"><div style="width:${pct}%;background:${colores[i] || colores.at(-1)}"></div></div><span class="zona-tiempo"></span>`;
    fila.firstElementChild.textContent = nombre;
    fila.lastElementChild.textContent = `${duracion(seg || 0)} (${Math.round(pct)}%)`;
    cont.appendChild(fila);
  });
}

// Suma los segundos pasados en cada zona. Devuelve una lista con una posición
// más que "limites" (la última es "por encima del máximo").
function calcularTiempoEnZonas(puntos, limites) {
  const tiempos = new Array(limites.length + 1).fill(0);
  for (let i = 0; i < puntos.length; i++) {
    const fc = puntos[i].fc;
    if (!fc) continue;
    const siguiente = puntos[i + 1];
    let seg = siguiente ? siguiente.t - puntos[i].t : 1;
    if (seg > 10) seg = 1; // un salto grande es una pausa: no se cuenta
    // Igual que Garmin: el número del límite ya pertenece a la zona siguiente.
    let zona = limites.findIndex((lim) => fc < lim);
    if (zona === -1) zona = limites.length;
    tiempos[zona] += seg;
  }
  return tiempos;
}

function colorCss(nombre) {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

function pintarGraficas(puntos, esCarrera) {
  graficasActivas.forEach((g) => g.destroy());
  graficasActivas = [];
  const cont = document.getElementById("graficas");
  cont.innerHTML = "";

  // Eje horizontal: distancia si existe, si no tiempo.
  const usaDistancia = puntos.some((p) => p.km);
  const ejeX = puntos.map((p) => (usaDistancia ? p.km : p.t / 60));
  const tituloX = usaDistancia ? "km" : "minutos";

  // Para no dibujar miles de puntos, se toma uno cada "salto".
  const salto = Math.max(1, Math.floor(puntos.length / 1200));

  const velSuave = suavizar(puntos.map((p) => p.vel), 15);
  const series = [
    { titulo: "Pulso (ppm)", valores: puntos.map((p) => p.fc), color: "--pulso" },
    esCarrera
      ? { titulo: "Ritmo (min/km)", valores: velSuave.map((v) => (v && v > 1 ? 1000 / v / 60 : null)), color: "--ritmo", ritmo: true }
      : { titulo: "Velocidad (km/h)", valores: velSuave.map((v) => (v != null ? v * 3.6 : null)), color: "--ritmo" },
    { titulo: "Altitud (m)", valores: puntos.map((p) => p.alt), color: "--altitud", relleno: true },
    { titulo: "Potencia (W)", valores: suavizar(puntos.map((p) => p.pot), 5), color: "--potencia" },
    {
      titulo: esCarrera ? "Cadencia (pasos/min)" : "Cadencia (rpm)",
      valores: puntos.map((p) => (p.cad == null || p.cad === 0 ? null : esCarrera ? p.cad * 2 : p.cad)),
      color: "--cadencia",
    },
  ];

  const colorTexto = colorCss("--suave");
  const colorRejilla = colorCss("--borde");

  for (const s of series) {
    if (!s.valores.some((v) => v != null && v !== 0)) continue; // el archivo no trae este dato

    const datos = [];
    for (let i = 0; i < puntos.length; i += salto) {
      if (ejeX[i] != null) datos.push({ x: ejeX[i], y: s.valores[i] });
    }

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML = `<h3></h3><div class="grafica"><canvas></canvas></div>`;
    panel.querySelector("h3").textContent = s.titulo;
    cont.appendChild(panel);

    const color = colorCss(s.color);
    const validos = s.valores.filter((v) => v != null);
    const ejeY = { ticks: { color: colorTexto }, grid: { color: colorRejilla } };
    if (s.ritmo) {
      // Ritmo: más rápido arriba. Se recortan valores extremos (pausas) para que se lea bien.
      const ordenados = [...validos].sort((a, b) => a - b);
      ejeY.reverse = true;
      ejeY.min = Math.floor(ordenados[Math.floor(ordenados.length * 0.01)] * 2) / 2;
      ejeY.max = Math.ceil(ordenados[Math.floor(ordenados.length * 0.97)] * 2) / 2;
      ejeY.ticks.callback = (v) => duracion(v * 60);
    }

    graficasActivas.push(new Chart(panel.querySelector("canvas"), {
      type: "line",
      data: {
        datasets: [{
          data: datos,
          borderColor: color,
          backgroundColor: color + "33",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: s.relleno ? "start" : false,
          spanGaps: true,
        }],
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        parsing: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `${numero(items[0].parsed.x, usaDistancia ? 2 : 0)} ${tituloX}`,
              label: (item) => (s.ritmo ? `${duracion(item.parsed.y * 60)} /km` : numero(item.parsed.y, 0)),
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            max: ejeX.at(-1) ?? undefined,
            title: { display: true, text: tituloX, color: colorTexto },
            ticks: { color: colorTexto },
            grid: { color: colorRejilla },
          },
          y: ejeY,
        },
      },
    }));
  }
}

// Parciales calculados con los datos segundo a segundo:
// cada 1 km en carrera, cada 5 km en bicicleta.
function pintarParciales(puntos, esCarrera) {
  const tabla = document.getElementById("parciales");
  const paso = esCarrera ? 1 : 5;
  document.getElementById("tituloParciales").textContent = `Parciales cada ${paso} km`;

  const conDistancia = puntos.filter((p) => p.km != null);
  if (!conDistancia.length) {
    tabla.innerHTML = `<tr><td class="sin-datos">Esta actividad no trae distancia.</td></tr>`;
    return;
  }

  const filas = [];
  let desde = 0;
  let meta = paso;
  for (let i = 1; i <= conDistancia.length; i++) {
    const ultimo = i === conDistancia.length;
    if (ultimo || conDistancia[i].km >= meta) {
      const tramo = conDistancia.slice(desde, i + (ultimo ? 0 : 1));
      const a = tramo[0], b = tramo.at(-1);
      const km = b.km - a.km;
      const seg = b.t - a.t;
      if (km > 0.05) {
        const alts = tramo.map((p) => p.alt).filter((x) => x != null);
        filas.push({
          nombre: ultimo && km < paso * 0.98 ? `${numero(b.km, 2)}` : `${Math.round(meta)}`,
          km, seg,
          vel: (km * 1000) / seg,
          fc: promedio(tramo.map((p) => p.fc)),
          pot: promedio(tramo.map((p) => p.pot)),
          alt: alts.length ? alts.at(-1) - alts[0] : null,
        });
      }
      desde = i;
      meta += paso;
    }
  }

  const tienePot = filas.some((f) => f.pot);
  let html = `<tr><th>Km</th><th>Tiempo</th><th>${esCarrera ? "Ritmo" : "Velocidad"}</th><th>Pulso</th>${tienePot ? "<th>Potencia</th>" : ""}<th>Altitud</th></tr>`;
  for (const f of filas) {
    html += `<tr>
      <td>${f.nombre}</td>
      <td>${duracion(f.seg)}</td>
      <td>${esCarrera ? ritmo(f.vel) + " /km" : numero(f.vel * 3.6, 1) + " km/h"}</td>
      <td>${f.fc ? numero(f.fc) + " ppm" : "—"}</td>
      ${tienePot ? `<td>${f.pot ? numero(f.pot) + " W" : "—"}</td>` : ""}
      <td>${f.alt != null ? (f.alt > 0 ? "+" : "") + numero(f.alt) + " m" : "—"}</td>
    </tr>`;
  }
  tabla.innerHTML = html;
}

function pintarExtra(sesion, esCarrera) {
  const lista = [];
  const agregar = (etiqueta, valor, unidad, decimales = 0) => {
    if (valor != null) lista.push([etiqueta, numero(valor, decimales), unidad]);
  };
  if (sesion.totalElapsedTime != null) lista.push(["Tiempo total (con pausas)", duracion(sesion.totalElapsedTime), ""]);
  if (esCarrera && sesion.enhancedMaxSpeed) lista.push(["Ritmo más rápido", ritmo(sesion.enhancedMaxSpeed), "/km"]);
  if (!esCarrera && (sesion.enhancedMaxSpeed ?? sesion.maxSpeed)) agregar("Velocidad máxima", (sesion.enhancedMaxSpeed ?? sesion.maxSpeed) * 3.6, "km/h", 1);
  agregar("Potencia normalizada", sesion.normalizedPower, "W");
  agregar("Potencia máxima", sesion.maxPower, "W");
  agregar("Desnivel negativo", sesion.totalDescent, "m");
  agregar("Carga de entrenamiento", sesion.trainingLoadPeak, "");
  agregar("Efecto anaeróbico", sesion.totalAnaerobicTrainingEffect, "/ 5", 1);
  agregar("Longitud de zancada", sesion.avgStepLength != null ? sesion.avgStepLength / 1000 : null, "m", 2);
  agregar("Oscilación vertical", sesion.avgVerticalOscillation != null ? sesion.avgVerticalOscillation / 10 : null, "cm", 1);
  agregar("Tiempo de contacto", sesion.avgStanceTime, "ms");
  agregar("Relación vertical", sesion.avgVerticalRatio, "%", 1);
  agregar("Respiración media", sesion.enhancedAvgRespirationRate, "resp/min", 0);
  agregar("Temperatura media", sesion.avgTemperature, "°C");

  document.getElementById("panelExtra").hidden = lista.length === 0;
  pintarTarjetas("extra", lista);
}
