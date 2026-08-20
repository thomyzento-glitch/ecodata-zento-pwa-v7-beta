ECODATA ZENTO v10 — SUPABASE

Esta versión conecta la PWA con el proyecto Supabase de EcoData-Zento.

1. GitHub Pages sigue alojando la PWA.
2. Supabase guarda los pesajes compartidos.
3. localStorage se mantiene como respaldo offline.
4. Al recuperar conexión, los registros pendientes se sincronizan.
5. La app consulta la nube al abrirse, al volver a estar visible y cada 60 segundos.

CONFIGURACIÓN DE SUPABASE YA REALIZADA
- Tabla: public.pesajes
- RLS habilitado
- SELECT para anon/authenticated
- INSERT para anon/authenticated

IMPORTANTE
- No reemplazar la Publishable/anon key por service_role.
- No borrar las políticas RLS.
- Subir a GitHub Pages TODO el contenido de esta carpeta.
