ECODATA ZENTO — INTEGRACIÓN GOOGLE SHEETS

Esta versión mantiene Supabase como base de datos principal y agrega Google Sheets como destino adicional mediante Google Apps Script.

1. Crear un Spreadsheet y una hoja llamada Pesajes.
2. Abrir Extensiones → Apps Script.
3. Pegar el código del archivo GoogleAppsScript_EcoData.gs.
4. Cambiar SPREADSHEET_ID por el ID del Spreadsheet.
5. Implementar como Web app: Ejecutar como Me; acceso Anyone.
6. Copiar la URL que termina en /exec.
7. En app.js, buscar GOOGLE_SHEETS_CONFIG y pegar esa URL en endpoint.
8. Subir app.js y service-worker-v17.js junto con el resto del proyecto a GitHub Pages.

IMPORTANTE
- No poner credenciales privadas de Google en app.js.
- No reemplazar la publishable/anon key de Supabase por service_role.
- Google Sheets no reemplaza Supabase.
- Los registros que no puedan enviarse quedan en localStorage y se reintentan al recuperar conexión, al volver a la PWA, al iniciar y periódicamente.
- El Apps Script usa el ID único del pesaje y LockService para impedir duplicados.
