/**
 * EcoData Zento - Google Apps Script Web App
 *
 * CORRECCIÓN CRÍTICA DE PESO:
 * - Nunca usa "|| 0" para el peso.
 * - Acepta peso y pesoKg.
 * - Convierte coma decimal a punto.
 * - Rechaza peso ausente/inválido en lugar de guardar 0.
 *
 * IMPORTANTE:
 * Este archivo debe REEMPLAZAR el código del proyecto de Apps Script
 * y luego hay que crear una NUEVA IMPLEMENTACIÓN del Web App.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || typeof e.postData.contents !== "string") {
      return jsonResponse({ok:false, error:"No se recibió contenido POST"});
    }

    var body = e.postData.contents;
    var data;

    try {
      data = JSON.parse(body);
    } catch (parseErr) {
      return jsonResponse({ok:false, error:"El POST no contiene JSON válido"});
    }

    Logger.log("JSON recibido: " + JSON.stringify(data));
    Logger.log("peso recibido: " + data.peso + " | tipo: " + typeof data.peso);
    Logger.log("pesoKg recibido: " + data.pesoKg + " | tipo: " + typeof data.pesoKg);

    // Aceptamos ambos nombres para evitar que una versión antigua del frontend
    // termine provocando un peso 0 por un nombre de campo diferente.
    var rawPeso = (data.peso !== undefined && data.peso !== null)
      ? data.peso
      : data.pesoKg;

    if (rawPeso === undefined || rawPeso === null || String(rawPeso).trim() === "") {
      return jsonResponse({ok:false, error:"El campo peso no fue recibido"});
    }

    if (typeof rawPeso === "string") {
      rawPeso = rawPeso.trim().replace(",", ".");
    }

    var pesoFinal = Number(rawPeso);

    if (!isFinite(pesoFinal)) {
      return jsonResponse({
        ok:false,
        error:"Peso inválido recibido: " + String(rawPeso)
      });
    }

    if (pesoFinal < 0) {
      return jsonResponse({ok:false, error:"El peso no puede ser negativo"});
    }

    // Conservá aquí la misma selección de spreadsheet/hoja que usa tu proyecto.
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // IMPORTANTE: pesoFinal ocupa directamente la columna Peso.
    // No se usa ningún fallback a 0.
    sheet.appendRow([
      data.fecha || "",
      data.hora || "",
      data.empleado || "",
      data.sucursal || "",
      pesoFinal,
      data.observaciones || ""
    ]);

    SpreadsheetApp.flush();

    Logger.log("Fila guardada. Peso FINAL: " + pesoFinal);

    return jsonResponse({
      ok:true,
      peso:pesoFinal,
      pesoKg:pesoFinal
    });

  } catch (err) {
    Logger.log("ERROR doPost: " + (err && err.stack ? err.stack : err));
    return jsonResponse({
      ok:false,
      error:String(err && err.message ? err.message : err)
    });
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
