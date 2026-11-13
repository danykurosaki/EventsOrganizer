# OBOG cena · gestor de asistencia

Servidor Node único (Express + `node:sqlite` + nodemailer), frontend vanilla. Puerto por defecto **3004**.

## Puesta en marcha
```bash
nvm use            # Node >= 22.5 (probado con v26.13.1; ver .nvmrc)
npm install
cp .env.example .env   # editar APP_SECRET, BASE_URL, ADMIN_EMAILS, SMTP
node --disable-warning=ExperimentalWarning --env-file=.env server.js
```
Escucha en `127.0.0.1:3004`; publícalo con tu reverse proxy HTTPS (`proxy_pass http://127.0.0.1:3004`, con `TRUST_PROXY=1`).
Sistema: `obog-cena.service` (ajusta rutas) → `systemctl enable --now obog-cena`.

## Uso
1. Entra con un email de `ADMIN_EMAILS` (recibirás un código por correo).
2. Pestaña **Evento**: fecha, lugar, precios, plazo. Pestaña **Datos**: importa el CSV (`public/import-template.csv`: `cohort,name,email,manager_email,role`). Quien aparece como `manager_email` pasa a ser responsable.
3. Cada persona entra con su email → recibe código/enlace → responde **Sí / Duda / No** y puede cambiarlo hasta el plazo.
4. Los responsables ven y editan a sus personas (queda en el log); el admin ve todo y exporta CSV.
5. Pestaña **Actividad** (responsables y admin): quién ha cambiado su respuesta, agrupado por día y persona (de «Duda» a «Sí», notas, acompañantes…), con resumen de «hoy», marca de *nuevo* desde tu última visita, aviso de bajas/dudas y contador en la pestaña. El equipo ve solo a sus personas.

## Seguridad / datos
Códigos de 6 dígitos hasheados (10 min, 5 intentos, rate-limit), sesión en cookie HttpOnly 60 días, cabecera anti-CSRF, `noindex`. `GET /healthz` para monitorización. APP_SECRET en producción: mínimo 32 caracteres. Backup: copia periódica de `data/obog.db`. Tras el evento, borra o anonimiza (Datos → importar con «reemplazar»).

**Cuidado con `node seed.js`**: borra todas las personas y respuestas de la BD activa. Úsalo solo con `DB_FILE=/ruta/de/prueba.db`.
