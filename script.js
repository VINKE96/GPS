let video = document.getElementById("video");
let canvas = document.getElementById("canvas");
let captureBtn = document.getElementById("capture-btn");
let startBtn = document.getElementById("start-btn");
let pdfBtn = document.getElementById("pdf-btn");
let resetBtn = document.getElementById("reset-btn");
let thumbnailsDiv = document.getElementById("photo-thumbnails");

let photos = [];
let currentPosition = null;
let recordedVideo = null;
let mediaRecorder;
let recordedBlobs = [];

// --- Firma ---
const firmaCanvas = document.getElementById("firma-canvas");
const firmaCtx = firmaCanvas.getContext("2d");
firmaCtx.strokeStyle = "#000";
firmaCtx.lineWidth = 2;
firmaCtx.lineCap = "round";
let drawing = false;

firmaCanvas.addEventListener("mousedown", e => {
  drawing = true;
  firmaCtx.beginPath();
  firmaCtx.moveTo(e.offsetX, e.offsetY);
});
firmaCanvas.addEventListener("mousemove", e => {
  if (drawing) {
    firmaCtx.lineTo(e.offsetX, e.offsetY);
    firmaCtx.stroke();
  }
});
firmaCanvas.addEventListener("mouseup", () => drawing = false);
firmaCanvas.addEventListener("mouseleave", () => drawing = false);
document.getElementById("clear-firma").onclick = () => {
  firmaCtx.clearRect(0, 0, firmaCanvas.width, firmaCanvas.height);
};

// --- GPS ---
navigator.geolocation.getCurrentPosition(
  (pos) => currentPosition = pos.coords,
  () => alert("No se pudo obtener ubicación")
);

// --- Cámara (trasera + video opcional) ---
startBtn.onclick = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const backCamera = devices.find(d => d.kind === "videoinput" && d.label.toLowerCase().includes("back"));

    const constraints = backCamera
      ? { video: { deviceId: { exact: backCamera.deviceId } }, audio: false }
      : { video: { facingMode: { exact: "environment" } }, audio: false };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    captureBtn.disabled = false;

    const recordBtn = document.createElement("button");
    recordBtn.textContent = "Grabar Video";
    recordBtn.onclick = () => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        recordBtn.textContent = "Grabar Video";
      } else {
        recordedBlobs = [];
        mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        mediaRecorder.ondataavailable = e => e.data.size > 0 && recordedBlobs.push(e.data);
        mediaRecorder.onstop = () => {
          recordedVideo = new Blob(recordedBlobs, { type: "video/webm" });
          alert("Video grabado correctamente.");
        };
        mediaRecorder.start();
        recordBtn.textContent = "Detener Grabación";
      }
    };
    resetBtn.after(recordBtn);
  } catch (err) {
    alert("Error accediendo a la cámara: " + err.message);
  }
};

// --- Captura de foto ---
captureBtn.onclick = () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);

  const now = new Date();
  const timestamp = now.toLocaleString();
  const coords = currentPosition
    ? `${currentPosition.latitude.toFixed(6)}, ${currentPosition.longitude.toFixed(6)}`
    : "Ubicación no disponible";

  ctx.fillStyle = "white";
  ctx.font = "20px Arial";
  ctx.fillText(timestamp, 10, canvas.height - 40);
  ctx.fillText(coords, 10, canvas.height - 15);

  const imgData = canvas.toDataURL("image/jpeg");
  photos.push(imgData);
  const thumb = document.createElement("img");
  thumb.src = imgData;
  thumbnailsDiv.appendChild(thumb);
  pdfBtn.disabled = false;
};

// --- Reset ---
resetBtn.onclick = () => {
  thumbnailsDiv.innerHTML = "";
  photos = [];
  recordedVideo = null;
  pdfBtn.disabled = true;
  firmaCtx.clearRect(0, 0, firmaCanvas.width, firmaCanvas.height);
};

// --- Buscar datos en JSON ---
document.getElementById("buscar-datos").onclick = async () => {
  const tipoUsuario = document.getElementById("tipo-usuario").value;
  const codigo = document.getElementById("codigo-suministro").value.trim().toUpperCase();
  if (!codigo) return alert("Ingresa el código de suministro.");

  const res = await fetch("base_titulares.json");
  const data = await res.json();
  const user = data.find(u => u.codigo_usuario.trim().toUpperCase() === codigo);
  if (!user) return alert("No se encontró el suministro.");

  if (tipoUsuario === "titular") {
    document.getElementById("nombres_apellidos").value = user.nombres_apellidos || "";
    document.getElementById("dni").value = user.dni || "";
    document.getElementById("codigo_usuario").value = user.codigo_usuario || "";
  }

  document.getElementById("departamento").value = user.departamento || "";
  document.getElementById("provincia").value = user.provincia || "";
  document.getElementById("distrito").value = user.distrito || "";
  document.getElementById("localidad").value = user.localidad || "";

  document.getElementById("pdf-btn").disabled = false;
};

// --- Generar Excel ---
function generarExcel(campos) {
  const key = "historial_excel";
  let registros = JSON.parse(localStorage.getItem(key)) || [];
  const fila = {
    estado_usuario: document.getElementById("estado-usuario")?.value || "",
    tipo_usuario: document.getElementById("tipo-usuario")?.value || "",
    ...campos,
    timestamp: new Date().toLocaleString()
  };
  registros.push(fila);
  localStorage.setItem(key, JSON.stringify(registros));

  const columnas = Object.keys(fila);
  const data = [columnas.map(h => h.toUpperCase())];
  registros.forEach(reg => data.push(columnas.map(k => reg[k] || "")));
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Formularios RER");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

// --- Generar ZIP (PDF + Excel + fotos + video) ---
pdfBtn.onclick = async () => {
  const { jsPDF } = window.jspdf;
  const zip = new JSZip();
  const doc = new jsPDF("p", "mm", "a4");
  const firmaImg = firmaCanvas.toDataURL("image/png");

  const campos = {};
  document.querySelectorAll("#inspection-form input, #inspection-form textarea, #inspection-form select").forEach(input => {
    const key = input.id || input.name;
    if (key) campos[key] = input.value.trim();
  });

  const estado = document.getElementById("estado-usuario")?.value || "No especificado";
  const suministro = campos["codigo_usuario"] || "suministro";

  doc.setFontSize(14);
  doc.text("FORMATO DE INSPECCIÓN DE INSTALACIÓN RER AUTÓNOMA", 10, 20);
  doc.setFontSize(11);
  doc.text(`Estado del Usuario: ${estado}`, 10, 30);

  const res = await fetch("formulario.json");
  const secciones = await res.json();
  let y = 40;
  for (let i = 0; i < secciones.length; i++) {
    doc.setFont(undefined, "bold");
    doc.text(secciones[i].titulo, 10, y);
    doc.setFont(undefined, "normal");
    y += 7;
    for (const campo of secciones[i].campos) {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(`${campo.etiqueta}: ${campos[campo.id] || ""}`, 10, y);
      y += 7;
    }
  }

  if (y > 230) { doc.addPage(); y = 20; }
  doc.text("Firma del Usuario:", 10, y);
  doc.addImage(firmaImg, "PNG", 10, y + 5, 80, 40);

  photos.forEach((photo, i) => {
    doc.addPage();
    doc.text(`Foto ${i + 1}`, 10, 10);
    doc.addImage(photo, "JPEG", 10, 20, 180, 135);
    zip.file(`${suministro}-${i + 1}.jpeg`, photo.split(',')[1], { base64: true });
  });

  if (recordedVideo) zip.file(`${suministro}-video.webm`, recordedVideo);

  zip.file(`${suministro}-reporte.pdf`, doc.output("blob"));
  zip.file(`${suministro}-datos.xlsx`, generarExcel(campos));

  const content = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(content);
  link.download = `${suministro}.zip`;
  link.click();

  alert(`Archivo ${suministro}.zip generado correctamente.`);
};
