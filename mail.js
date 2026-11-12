import nodemailer from 'nodemailer';

let transport = null;
if (process.env.SMTP_URL) {
  transport = nodemailer.createTransport(process.env.SMTP_URL);
} else if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

export const mailEnabled = !!transport;
const FROM = process.env.MAIL_FROM || 'OBOG会 <no-reply@localhost>';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export async function sendCode({ to, name, code, link, title }) {
  if (!transport) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP no configurado');
    console.log(`[mail:dev] código para ${to}: ${code}  (enlace: ${link})`);
    return;
  }
  const text =
    `${name} 様 / Hola ${name}\n\n` +
    `${title}\n\n` +
    `コード / Código: ${code}\n` +
    `リンク / Enlace: ${link}\n\n` +
    `10分間有効です。/ Caduca en 10 minutos.\n` +
    `心当たりがない場合は無視してください。/ Si no lo has pedido, ignora este correo.`;
  const html = `<div style="font-family:system-ui,'Hiragino Sans','Noto Sans JP',sans-serif;max-width:480px;margin:auto;padding:24px">
  <h2 style="margin:0 0 8px">${esc(title)}</h2>
  <p>${esc(name)} 様 / Hola ${esc(name)}</p>
  <p style="font-size:32px;letter-spacing:8px;font-weight:700;background:#f3f0ff;border-radius:12px;padding:16px;text-align:center">${esc(code)}</p>
  <p><a href="${esc(link)}" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">ログイン / Entrar</a></p>
  <p style="color:#666;font-size:13px">10分間有効です。/ Caduca en 10 minutos.<br>心当たりがない場合は無視してください。/ Si no lo has pedido, ignora este correo.</p></div>`;
  await transport.sendMail({ from: FROM, to, subject: `${title} · ${code}`, text, html });
}
