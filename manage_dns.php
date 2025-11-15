<?php

// Colores ANSI
define('GRAY', "\033[0;90m");
define('RED', "\033[0;31m");
define('GREEN', "\033[0;32m");
define('YELLOW', "\033[1;33m");
define('BLUE', "\033[0;34m");
define('CYAN', "\033[0;36m");
define('WHITE', "\033[1;37m");
define('NC', "\033[0m");

function log_message($emoji, $level, $color, $message) {
    $timestamp = date('Y-m-d H:i:s');
    echo GRAY . "[{$timestamp}]" . NC . " {$color}{$emoji} {$level}" . NC . " â”‚ {$message}\n";
}

// Validar argumentos
if ($argc < 7) {
    log_message('âŒ', 'ERROR', RED, 'Argumentos insuficientes');
    exit(1);
}

$domain = $argv[1];
$record = $argv[2];
$type = $argv[3];
$proxy = filter_var($argv[4], FILTER_VALIDATE_BOOLEAN);
$apiToken = $argv[5];
$zoneId = $argv[6];

// Construir nombre completo
if ($record === "@" || empty($record)) {
    $fullname = $domain;
} else {
    $fullname = "$record.$domain";
}

$endpoint = "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records";

echo GRAY . "   â”œâ”€" . NC . " " . BLUE . "ðŸ” Buscando" . NC . " " . WHITE . $fullname . NC . GRAY . " (tipo: $type)" . NC . "\n";

// Buscar registro existente
$ch = curl_init("$endpoint?name=" . urlencode($fullname) . "&type=$type");
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer $apiToken",
    "Content-Type: application/json"
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($response === false) {
    echo GRAY . "   â”œâ”€" . NC . " " . RED . "âŒ Error de conexiÃ³n: " . NC . $curlError . "\n";
    exit(1);
}

if ($httpCode !== 200) {
    echo GRAY . "   â”œâ”€" . NC . " " . RED . "âŒ HTTP $httpCode" . NC . " al consultar Cloudflare\n";
    exit(1);
}

$result = json_decode($response, true);

if (!isset($result['result']) || !is_array($result['result'])) {
    echo GRAY . "   â”œâ”€" . NC . " " . RED . "âŒ Respuesta invÃ¡lida" . NC . " de Cloudflare API\n";
    exit(1);
}

if (empty($result['result'])) {
    echo GRAY . "   â”œâ”€" . NC . " " . RED . "âŒ Registro no encontrado" . NC . "\n";
    echo GRAY . "   â””â”€" . NC . " " . YELLOW . "ðŸ’¡ Verifica:" . NC . " nombre correcto y tipo de registro\n";
    exit(1);
}

// Procesar registro encontrado
$recordData = $result['result'][0];
$recordId = $recordData['id'];
$content = $recordData['content'];
$currentProxied = $recordData['proxied'];

// Determinar emoji del proxy
$proxyEmoji = $proxy ? "ðŸ”’" : "ðŸ”“";
$currentProxyEmoji = $currentProxied ? "ðŸ”’" : "ðŸ”“";

// Verificar si ya estÃ¡ en el estado deseado
if ($currentProxied === $proxy) {
    $statusColor = $proxy ? GREEN : YELLOW;
    echo GRAY . "   â”œâ”€" . NC . " " . $statusColor . "â„¹ï¸  Sin cambios" . NC . " â”‚ " . WHITE . $fullname . NC;
    echo GRAY . " ya estÃ¡ " . NC . $proxyEmoji . GRAY . " (IP: " . CYAN . $content . GRAY . ")" . NC . "\n";
    exit(0);
}

// Preparar payload de actualizaciÃ³n
$payload = json_encode([
    "type" => $type,
    "name" => $fullname,
    "content" => $content,
    "proxied" => $proxy,
    "ttl" => $proxy ? 1 : 300  // TTL auto si estÃ¡ proxied, 5min si no
]);

// Actualizar registro
$ch = curl_init("$endpoint/$recordId");
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer $apiToken",
    "Content-Type: application/json"
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "PUT");
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
$resp = curl_exec($ch);
$updateCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($resp === false) {
    echo GRAY . "   â”œâ”€" . NC . " " . RED . "âŒ Error de conexiÃ³n: " . NC . $curlError . "\n";
    exit(1);
}

if ($updateCode === 200) {
    $change = $currentProxyEmoji . " â†’ " . $proxyEmoji;
    echo GRAY . "   â”œâ”€" . NC . " " . GREEN . "âœ… Actualizado" . NC . " â”‚ " . WHITE . $fullname . NC;
    echo " " . GRAY . $change . " (IP: " . CYAN . $content . GRAY . ")" . NC . "\n";
    exit(0);
} else {
    $updateResult = json_decode($resp, true);
    $errorMsg = $updateResult['errors'][0]['message'] ?? 'Error desconocido';
    echo GRAY . "   â”œâ”€" . NC . " " . RED . "âŒ HTTP $updateCode" . NC . " â”‚ $errorMsg\n";
    exit(1);
}