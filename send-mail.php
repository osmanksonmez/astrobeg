<?php
/**
 * send-mail.php
 * Handles contact form submissions and sends them via Hostinger SMTP.
 * Requires PHPMailer: composer require phpmailer/phpmailer
 */

header('Content-Type: application/json; charset=utf-8');

// Only accept POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'Method not allowed.']);
    exit;
}

// Load credentials (not committed to git)
$config = __DIR__ . '/mail-config.php';
if (!file_exists($config)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'Mail configuration missing.']);
    exit;
}
require $config;

// ── Autoload PHPMailer ─────────────────────────────────────────
require __DIR__ . '/vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

// ── Sanitise & validate inputs ────────────────────────────────
function clean(string $val): string {
    return htmlspecialchars(strip_tags(trim($val)), ENT_QUOTES, 'UTF-8');
}

$adSoyad      = clean($_POST['ad_soyad']      ?? '');
$dogumTarihi  = clean($_POST['dogum_tarihi']  ?? '');
$dogumSaati   = clean($_POST['dogum_saati']   ?? '');
$dogumYeri    = clean($_POST['dogum_yeri']    ?? '');
$notlar       = clean($_POST['notlar']        ?? '');
$replyEmail   = filter_var(trim($_POST['email'] ?? ''), FILTER_VALIDATE_EMAIL);

if (!$adSoyad || !$dogumTarihi || !$dogumYeri) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'message' => 'Lütfen zorunlu alanları doldurun.']);
    exit;
}

// ── Build email body ──────────────────────────────────────────
$body = "
<html><body style='font-family:sans-serif;color:#222;'>
<h2 style='color:#1E2A7A;'>Yeni Danışmanlık Talebi</h2>
<table cellpadding='8' style='border-collapse:collapse;width:100%;max-width:520px;'>
  <tr><td style='background:#f5f5f5;font-weight:bold;width:160px;'>Ad Soyad</td><td>{$adSoyad}</td></tr>
  <tr><td style='background:#f5f5f5;font-weight:bold;'>Doğum Tarihi</td><td>{$dogumTarihi}</td></tr>
  <tr><td style='background:#f5f5f5;font-weight:bold;'>Doğum Saati</td><td>" . ($dogumSaati ?: '—') . "</td></tr>
  <tr><td style='background:#f5f5f5;font-weight:bold;'>Doğum Yeri</td><td>{$dogumYeri}</td></tr>
  <tr><td style='background:#f5f5f5;font-weight:bold;'>E-posta</td><td>" . ($replyEmail ?: '—') . "</td></tr>
  <tr><td style='background:#f5f5f5;font-weight:bold;vertical-align:top;'>Notlar</td><td>" . nl2br($notlar ?: '—') . "</td></tr>
</table>
</body></html>
";

$plainText = "Yeni Danışmanlık Talebi\n\n"
    . "Ad Soyad: {$adSoyad}\n"
    . "Doğum Tarihi: {$dogumTarihi}\n"
    . "Doğum Saati: " . ($dogumSaati ?: '—') . "\n"
    . "Doğum Yeri: {$dogumYeri}\n"
    . "E-posta: " . ($replyEmail ?: '—') . "\n"
    . "Notlar: " . ($notlar ?: '—') . "\n";

// ── Send via PHPMailer ────────────────────────────────────────
$mail = new PHPMailer(true);

try {
    $mail->isSMTP();
    $mail->Host        = SMTP_HOST;
    $mail->Port        = SMTP_PORT;
    $mail->SMTPSecure  = PHPMailer::ENCRYPTION_SMTPS;   // SSL on port 465
    $mail->SMTPAuth    = true;
    $mail->Username    = SMTP_USER;
    $mail->Password    = SMTP_PASS;
    $mail->CharSet     = 'UTF-8';

    $mail->setFrom(MAIL_FROM, MAIL_FROM_NAME);
    $mail->addAddress(MAIL_TO);
    if ($replyEmail) {
        $mail->addReplyTo($replyEmail, $adSoyad);
    }

    $mail->Subject  = "Danışmanlık Talebi – {$adSoyad}";
    $mail->Body     = $body;
    $mail->AltBody  = $plainText;
    $mail->isHTML(true);

    $mail->send();

    echo json_encode(['ok' => true, 'message' => 'Mesajınız iletildi. En kısa sürede dönüş yapacağım.']);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'Gönderim sırasında bir hata oluştu. Lütfen daha sonra tekrar deneyin.']);
    // Log the real error server-side, never expose it to the client
    error_log('PHPMailer error: ' . $mail->ErrorInfo);
}
