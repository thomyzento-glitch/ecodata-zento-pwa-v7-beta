const SPREADSHEET_ID = "PEGAR_AQUI_ID_DEL_SPREADSHEET";
const PESAJES_SHEET = "Pesajes";
const CONTROL_SHEET = "Control";
const LOCK_TIMEOUT_MS = 30000;

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(LOCK_TIMEOUT_MS);

    const data = parseRequest_(e);
    validateData_(data);

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const pesajes = getOrCreatePesajesSheet_(spreadsheet);
    const control = getOrCreateControlSheet_(spreadsheet);

    const id = String(data.id).trim();
    const existingRow = findIdInControl_(control, id);

    if (existingRow !== -1) {
      console.log("EcoData · duplicado · ID: " + id);
      return jsonResponse_({
        success: true,
        duplicate: true,
        message: "El pesaje ya estaba registrado"
      });
    }

    const peso = Number(data.peso);
    const row = [
      String(data.fecha).trim(),
      String(data.hora).trim(),
      String(data.empleado).trim(),
      String(data.sucursal).trim(),
      peso
    ];

    pesajes.appendRow(row);
    formatPesajes_(pesajes);

    control.appendRow([id, new Date()]);
    control.hideSheet();

    console.log(
      "EcoData · recepción · ID: %s · Empleado: %s · Sucursal: %s · Peso: %s · Resultado: guardado",
      id,
      String(data.empleado).trim(),
      String(data.sucursal).trim(),
      peso
    );

    return jsonResponse_({
      success: true,
      duplicate: false,
      message: "Pesaje guardado correctamente"
    });

  } catch (error) {
    console.error("EcoData · error: " + (error && error.stack ? error.stack : error));

    return jsonResponse_({
      success: false,
      error: error && error.message ? error.message : String(error)
    });

  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

function doGet() {
  return jsonResponse_({
    success: true,
    service: "EcoData Zento Google Sheets API",
    message: "Web App activo. Utilizá POST para registrar pesajes."
  });
}

function parseRequest_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== "string") {
    throw new Error("No se recibió un cuerpo POST válido");
  }

  const raw = e.postData.contents.trim();
  if (!raw) {
    throw new Error("El cuerpo de la solicitud está vacío");
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    throw new Error("JSON inválido");
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("El JSON debe contener un objeto");
  }

  return data;
}

function validateData_(data) {
  const required = ["id", "fecha", "hora", "empleado", "sucursal"];

  required.forEach(function (field) {
    if (data[field] === undefined || data[field] === null || String(data[field]).trim() === "") {
      throw new Error("Falta el campo obligatorio: " + field);
    }
  });

  const peso = Number(data.peso);
  if (!Number.isFinite(peso) || peso < 0) {
    throw new Error("Peso inválido");
  }

  if (String(data.id).trim().length > 200) {
    throw new Error("ID demasiado largo");
  }

  if (String(data.fecha).trim().length > 50) {
    throw new Error("Fecha inválida");
  }

  if (String(data.hora).trim().length > 50) {
    throw new Error("Hora inválida");
  }

  if (String(data.empleado).trim().length > 200) {
    throw new Error("Empleado demasiado largo");
  }

  if (String(data.sucursal).trim().length > 200) {
    throw new Error("Sucursal demasiado larga");
  }
}

function getOrCreatePesajesSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(PESAJES_SHEET);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(PESAJES_SHEET);
  }

  const headers = ["Fecha", "Hora", "Empleado", "Sucursal", "Peso"];
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const empty = current.every(function (value) {
    return String(value).trim() === "";
  });

  if (empty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  formatPesajes_(sheet);
  return sheet;
}

function getOrCreateControlSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(CONTROL_SHEET);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONTROL_SHEET);
    sheet.getRange(1, 1, 1, 2).setValues([["ID", "Fecha de recepción"]]);
    sheet.getRange(1, 1, 1, 2).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  return sheet;
}

function findIdInControl_(control, id) {
  const lastRow = control.getLastRow();
  if (lastRow < 2) return -1;

  const values = control.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  const target = String(id);

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === target) {
      return i + 2;
    }
  }

  return -1;
}

function formatPesajes_(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), 1);

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 5).setFontWeight("bold");
  sheet.getRange(1, 1, 1, 5).setHorizontalAlignment("center");

  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 1).setNumberFormat("dd/MM/yyyy");
    sheet.getRange(2, 2, lastRow - 1, 1).setNumberFormat("HH:mm:ss");
    sheet.getRange(2, 5, lastRow - 1, 1).setNumberFormat("0.00");
  }

  sheet.setColumnWidth(1, 105);
  sheet.setColumnWidth(2, 85);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 130);
  sheet.setColumnWidth(5, 90);

  const filter = sheet.getFilter();
  if (!filter) {
    sheet.getRange(1, 1, Math.max(lastRow, 1), 5).createFilter();
  }
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
