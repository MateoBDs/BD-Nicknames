# Bot de Nicknames por Rol

Este bot cambia automáticamente el apodo de un usuario cuando se le asigna un rol específico configurado previamente.

## Instalación

1. Asegúrate de tener [Node.js](https://nodejs.org/) instalado.
2. Descarga los archivos del bot.
3. Abre una terminal en la carpeta del bot y ejecuta:
   ```bash
   npm install
   ```
4. Renombra el archivo `.env.example` a `.env` y rellena los datos:
   - `DISCORD_TOKEN`: El token de tu bot desde el [Discord Developer Portal](https://discord.com/developers/applications).
   - `CLIENT_ID`: El ID de tu aplicación (Application ID).

## Uso

1. Invita al bot a tu servidor con los permisos necesarios (Gestionar Apodos, Ver Canales, etc.).
2. **IMPORTANTE**: Asegúrate de que el rol del bot esté **por encima** de los roles que quieres gestionar en la lista de roles del servidor. El bot no puede cambiar el apodo de usuarios con roles superiores al suyo.
3. Usa el comando:
   ```text
   /add-role-nickname @rol [PREFIJO] {uname}
   ```
   Ejemplo: `/add-role-nickname @VIP [VIP] {uname}`
4. Cuando un usuario reciba ese rol, su apodo cambiará automáticamente a `[VIP] NombreDeUsuario`.

## Características
- **{uname}**: Se reemplaza automáticamente por el nombre de usuario de Discord.
- **Persistencia**: Las configuraciones se guardan en un archivo `config.json` para que no se pierdan al reiniciar.
- **Seguridad**: Solo los administradores pueden usar el comando de configuración.
