// api/send-mail.js — Vercel Serverless Function
// Receives contact form data and sends it to info@astrobeg.com via Hostinger SMTP.
// Set SMTP_PASS in Vercel → Project Settings → Environment Variables.

const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  const { ad_soyad, email, dogum_tarihi, dogum_saati, dogum_yeri, notlar } = req.body ?? {};

  if (!ad_soyad?.trim() || !dogum_tarihi?.trim() || !dogum_yeri?.trim()) {
    return res.status(422).json({ ok: false, message: 'Lütfen zorunlu alanları doldurun.' });
  }

  const transporter = nodemailer.createTransport({
    host:   'smtp.hostinger.com',
    port:   465,
    secure: true,                     // SSL
    auth: {
      user: 'info@astrobeg.com',
      pass: process.env.SMTP_PASS,
    },
  });

  const html = `
<html><body style="font-family:sans-serif;color:#222;">
<h2 style="color:#1E2A7A;">Yeni Danışmanlık Talebi</h2>
<table cellpadding="8" style="border-collapse:collapse;width:100%;max-width:520px;">
  <tr><td style="background:#f5f5f5;font-weight:bold;width:160px;">Ad Soyad</td><td>${ad_soyad}</td></tr>
  <tr><td style="background:#f5f5f5;font-weight:bold;">Doğum Tarihi</td><td>${dogum_tarihi}</td></tr>
  <tr><td style="background:#f5f5f5;font-weight:bold;">Doğum Saati</td><td>${dogum_saati || '—'}</td></tr>
  <tr><td style="background:#f5f5f5;font-weight:bold;">Doğum Yeri</td><td>${dogum_yeri}</td></tr>
  <tr><td style="background:#f5f5f5;font-weight:bold;">E-posta</td><td>${email || '—'}</td></tr>
  <tr><td style="background:#f5f5f5;font-weight:bold;vertical-align:top;">Notlar</td><td>${(notlar || '—').replace(/\n/g, '<br>')}</td></tr>
</table>
</body></html>`;

  const text = [
    'Yeni Danışmanlık Talebi',
    '',
    `Ad Soyad: ${ad_soyad}`,
    `Doğum Tarihi: ${dogum_tarihi}`,
    `Doğum Saati: ${dogum_saati || '—'}`,
    `Doğum Yeri: ${dogum_yeri}`,
    `E-posta: ${email || '—'}`,
    `Notlar: ${notlar || '—'}`,
  ].join('\n');

  try {
    await transporter.sendMail({
      from:     '"Astrobeg İletişim Formu" <info@astrobeg.com>',
      to:       'info@astrobeg.com',
      replyTo:  email || 'info@astrobeg.com',
      subject:  `Danışmanlık Talebi – ${ad_soyad}`,
      html,
      text,
    });

    return res.status(200).json({ ok: true, message: 'Mesajınız iletildi. En kısa sürede dönüş yapacağım.' });
  } catch (err) {
    console.error('SMTP error:', err.message);
    return res.status(500).json({ ok: false, message: 'Gönderim sırasında bir hata oluştu. Lütfen daha sonra tekrar deneyin.' });
  }
};
