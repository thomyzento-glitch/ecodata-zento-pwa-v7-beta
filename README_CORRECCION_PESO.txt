ARCHIVOS MODIFICADOS
- app.js
- service-worker-v16.js
- GoogleAppsScript_Code.gs (nuevo: código para copiar al proyecto de Apps Script)

CAUSA ENCONTRADA
El frontend ya construía record.peso correctamente. Sin embargo, había conversiones silenciosas a 0:
- sendToGoogleSheets: record.peso !== undefined ? record.peso : 0
- recordToRemote/remoteToLocal: Number(r.peso || 0)
Además, app.js registraba service-worker-v15.js aunque el ZIP sólo contiene service-worker-v16.js.

CAMBIOS
- Validación explícita del peso, preservando 0 como valor válido.
- Acepta coma decimal en strings.
- No envía peso inválido a Google Sheets.
- Payload explícito con peso numérico.
- Logs temporales del input, record y payload.
- Service Worker registrado con el archivo real v16 y caché/versiones alineadas.
- Apps Script sin parseFloat(...) || 0; devuelve errores JSON.

IMPORTANTE
El ZIP original no contiene el código actualmente desplegado en Google Apps Script. Por eso no es posible demostrar desde el ZIP qué línea de ese proyecto desplegado convierte el peso en 0. Copiá GoogleAppsScript_Code.gs en Apps Script, conservando cualquier selección específica de Spreadsheet/Sheet que uses si no es ActiveSpreadsheet/ActiveSheet, y creá una nueva implementación del Web App. Luego actualizá GOOGLE_SCRIPT_URL si Apps Script te entrega una URL distinta.
