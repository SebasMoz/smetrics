// SMetrics — conexión opcional con Google Drive.
//
// Lee la carpeta donde FitnessSyncer va dejando los .FIT del reloj.
// El permiso se le pide a Google redirigiendo la página, sin cargar ninguna
// librería externa, y el token vive solo en memoria: al cerrar la app no
// queda nada guardado en el navegador.
//
// Solo funciona en la versión publicada en internet. Abriendo index.html con
// doble clic, Google rechaza la conexión (y la app sigue sirviendo para
// arrastrar archivos, como siempre).

"use strict";

(function () {
  const CFG = (window.CONFIGURACION && window.CONFIGURACION.google) || {};
  const AMBITO = "https://www.googleapis.com/auth/drive.readonly";
  const API = "https://www.googleapis.com/drive/v3";

  const panel = document.getElementById("panelDrive");
  const boton = document.getElementById("botonDrive");
  const estado = document.getElementById("estadoDrive");
  const lista = document.getElementById("listaDrive");

  let token = null;
  let idCarpeta = null;

  recogerRespuestaDeGoogle();

  if (!CFG.clientId) return;
  panel.hidden = false;

  boton.addEventListener("click", () => {
    if (token) cargarLista();
    else pedirPermiso();
  });

  if (token) cargarLista();

  // ---------- Permiso de Google ----------

  function pedirPermiso() {
    const p = new URLSearchParams({
      client_id: CFG.clientId,
      redirect_uri: location.origin + location.pathname,
      response_type: "token",
      scope: AMBITO,
      include_granted_scopes: "true",
    });
    location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + p;
  }

  // Google devuelve el permiso en la parte de la dirección que va tras el #.
  function recogerRespuestaDeGoogle() {
    if (!location.hash || location.hash.length < 2) return;
    const h = new URLSearchParams(location.hash.slice(1));
    const t = h.get("access_token");
    const error = h.get("error");
    if (!t && !error) return;

    history.replaceState(null, "", location.pathname + location.search);
    if (t) token = t;
    else if (error === "access_denied") decir("No diste el permiso, así que no se puede leer la carpeta.");
    else decir("Google no concedió el permiso (" + error + ").");
  }

  // ---------- Hablar con Drive ----------

  async function pedir(ruta) {
    const r = await fetch(API + ruta, { headers: { Authorization: "Bearer " + token } });
    if (r.status === 401 || r.status === 403) {
      token = null;
      boton.textContent = "Conectar con Google Drive";
      throw new Error("El permiso de Google se venció. Toca «Conectar» otra vez.");
    }
    if (!r.ok) throw new Error("Google respondió con un error (" + r.status + ").");
    return r;
  }

  async function buscarCarpeta() {
    const nombre = (CFG.carpeta || "SMetrics").replace(/'/g, "\\'");
    const p = new URLSearchParams({
      q: `name='${nombre}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name)",
      pageSize: "10",
    });
    const { files } = await (await pedir("/files?" + p)).json();
    if (!files.length) {
      throw new Error(`No encontré una carpeta llamada «${CFG.carpeta || "SMetrics"}» en tu Drive.`);
    }
    return files[0].id;
  }

  async function listarArchivos() {
    const p = new URLSearchParams({
      q: `'${idCarpeta}' in parents and trashed=false`,
      orderBy: "name desc",
      pageSize: "60",
      fields: "files(id,name,modifiedTime)",
    });
    const { files } = await (await pedir("/files?" + p)).json();
    return files;
  }

  async function cargarLista() {
    decir("Buscando tus entrenamientos…");
    lista.innerHTML = "";
    try {
      if (!idCarpeta) idCarpeta = await buscarCarpeta();
      const archivos = await listarArchivos();
      if (!archivos.length) {
        decir("La carpeta existe pero está vacía todavía.");
        return;
      }
      pintarLista(archivos);
      decir(archivos.length + " entrenamientos en tu carpeta. Toca uno para verlo.");
      boton.textContent = "Actualizar lista";
    } catch (err) {
      console.error(err);
      decir(err.message);
    }
  }

  function pintarLista(archivos) {
    for (const a of archivos) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "drive-item";
      b.innerHTML =
        '<span class="drive-nombre"></span><span class="drive-fecha"></span>';
      b.querySelector(".drive-nombre").textContent = a.name;
      b.querySelector(".drive-fecha").textContent = fecha(a.modifiedTime);
      b.addEventListener("click", () => abrir(a));
      lista.appendChild(b);
    }
  }

  async function abrir(archivo) {
    decir("Descargando " + archivo.name + "…");
    try {
      const r = await pedir("/files/" + archivo.id + "?alt=media");
      window.abrirBytes(await r.arrayBuffer(), archivo.name);
    } catch (err) {
      console.error(err);
      decir(err.message);
    }
  }

  // ---------- Ayudas ----------

  function decir(texto) {
    estado.textContent = texto;
    estado.hidden = false;
  }

  function fecha(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
})();
