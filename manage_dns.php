<?php
/**
 * CF Football Bypass — DNS Record Manager
 * Updates a single Cloudflare DNS record's proxy status.
 *
 * Usage: php manage_dns.php <domain> <record> <type> <proxy> <api_token> <zone_id>
 *
 * @author    Jose Manuel Pedraja
 * @copyright 2025 SurMod
 * @license   GPL-2.0-or-later
 */

define('GRAY', "\033[0;90m");
define('RED', "\033[0;31m");
define('GREEN', "\033[0;32m");
define('YELLOW', "\033[1;33m");
define('BLUE', "\033[0;34m");
define('CYAN', "\033[0;36m");
define('WHITE', "\033[1;37m");
define('NC', "\033[0m");

if ($argc < 7) {
    fwrite(STDERR, RED . "ERROR" . NC . " | Missing arguments. Usage: php manage_dns.php <domain> <record> <type> <proxy> <api_token> <zone_id>\n");
    exit(1);
}

$domain   = $argv[1];
$record   = $argv[2];
$type     = strtoupper($argv[3]);
$proxy    = filter_var($argv[4], FILTER_VALIDATE_BOOLEAN);
$apiToken = $argv[5];
$zoneId   = $argv[6];

if ($record === '@' || empty($record)) {
    $fullname = $domain;
} else {
    $fullname = "$record.$domain";
}

$endpoint = "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records";

echo GRAY . "   \xe2\x94\x9c\xe2\x94\x80" . NC . " " . BLUE . "\xf0\x9f\x94\x8d Searching" . NC . " " . WHITE . $fullname . NC . GRAY . " (type: $type)" . NC . "\n";

$ch = curl_init("$endpoint?" . http_build_query(['name' => $fullname, 'type' => $type]));
curl_setopt_array($ch, [
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer $apiToken",
        "Content-Type: application/json",
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_USERAGENT      => 'CFB-Docker/2.0',
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($response === false) {
    echo GRAY . "   \xe2\x94\x9c\xe2\x94\x80" . NC . " " . RED . "\xe2\x9d\x8c Connection error: " . NC . $curlError . "\n";
    exit(1);
}

if ($httpCode !== 200) {
    echo GRAY . "   \xe2\x94\x9c\xe2\x94\x80" . NC . " " . RED . "\xe2\x9d\x8c HTTP $httpCode" . NC . " querying Cloudflare\n";
    exit(1);
}

$result = json_decode($response, true);

if (!isset($result['result']) || !is_array($result['result'])) {
    echo GRAY . "   \xe2\x94\x9c\xe2\x94\x80" . NC . " " . RED . "\xe2\x9d\x8c Invalid response" . NC . " from Cloudflare API\n";
    exit(1);
}

if (empty($result['result'])) {
    echo GRAY . "   \xe2\x94\x9c\xe2\x94\x80" . NC . " " . RED . "\xe2\x9d\x8c Record not found" . NC . "\n";
    echo GRAY . "   \xe2\x94\x94\xe2\x94\x80" . NC . " " . YELLOW . "\xf0\x9f\x92\xa1 Verify:" . NC . " correct name and record type\n";
    exit(1);
}

$recordData     = $result['result'][0];
$recordId       = $recordData['id'];
$content        = $recordData['content'];
$currentProxied = $recordData['proxied'];

$proxyLabel   = $proxy ? GREEN . "ON" . NC : YELLOW . "OFF" . NC;
$currentLabel = $currentProxied ? GREEN . "ON" . NC : YELLOW . "OFF" . NC;

if ($currentProxied === $proxy) {
    echo GRAY . "   \xe2\x94\x9c\xe2\x94\x80" . NC . " " . GREEN . "\xe2\x84\xb9\xef\xb8\x8f  No change" . NC . " | " . WHITE . $fullname . NC . GRAY . " already " . NC . $proxyLabel . GRAY . " (IP: " . CYAN . $content . GRAY . ")" . NC . "\n";
    exit(0);
}

$payload = json_encode([
    'type'    => $type,
    'name'    => $fullname,
    'content' => $content,
    'proxied' => $proxy,
    'ttl'     => $proxy ? 1 : 300,
]);

$ch = curl_init("$endpoint/$recordId");
curl_setopt_array($ch, [
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer $apiToken",
        "Content-Type: application/json",
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => 'PUT',
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_USERAGENT      => 'CFB-Docker/2.0',
]);
$resp       = curl_exec($ch);
$updateCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError  = curl_error($ch);
curl_close($ch);

if ($resp === false) {
    echo GRAY . "   \xe2\x94\x9c\xe2\x94\x80" . NC . " " . RED . "\xe2\x9d\x8c Connection error: " . NC . $curlError . "\n";
    exit(1);
}

if ($updateCode === 200) {
    echo GRAY . "   \xe2\x94\x9c\xe2\x94\x80" . NC . " " . GREEN . "\xe2\x9c\x85 Updated" . NC . " | " . WHITE . $fullname . NC . " " . $currentLabel . " \xe2\x86\x92 " . $proxyLabel . GRAY . " (IP: " . CYAN . $content . GRAY . ")" . NC . "\n";
    exit(0);
} else {
    $updateResult = json_decode($resp, true);
    $errorMsg = $updateResult['errors'][0]['message'] ?? 'Unknown error';
    echo GRAY . "   \xe2\x94\x9c\xe2\x94\x80" . NC . " " . RED . "\xe2\x9d\x8c HTTP $updateCode" . NC . " | $errorMsg\n";
    exit(1);
}
