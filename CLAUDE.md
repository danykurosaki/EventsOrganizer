# Reglas del proyecto

- **Prohibido borrar sin consultar al usuario**: no uses `rm`, `rm -rf`, `DELETE`/`DROP` sobre datos, ni borres/renombres/sobrescribas archivos de `data/` sin preguntar antes y obtener confirmación expresa.
- **Nunca ejecutes `node seed.js` contra la BD por defecto** (`data/obog.db`): borra todas las personas y respuestas. Solo con `DB_FILE=<ruta de prueba>` explícito, o si el usuario lo pide.
- Pruebas automáticas: usa siempre una BD temporal (`DB_FILE` en el directorio scratchpad), verifica que la variable está fijada antes de ejecutar nada y no uses globs sin comillas en zsh.
- Usuarios de prueba (datos ficticios, ver `seed.js`): `admin@example.com`, `manager1..3@example.com`, miembros como `akira1@example.com`. Se mantienen en `data/obog.db` para desarrollo.
- Login en local: `npm run dev` activa `DEV_SHOW_CODE=1`, así el código aparece en pantalla (solo con BASE_URL localhost y sin SMTP).
- Node >= 22.5 (`nvm use`, ver `.nvmrc`).
