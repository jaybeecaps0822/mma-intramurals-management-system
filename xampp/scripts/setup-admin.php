<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/../config/database.php';

$username = strtolower(trim($argv[1] ?? ''));
$name = trim($argv[2] ?? '');
$password = getenv('MMA_SETUP_PASSWORD');
// A bcrypt-backed PASSWORD_DEFAULT considers only 72 bytes.
if (!preg_match('/\A[a-z0-9][a-z0-9_.@-]{2,79}\z/', $username)
    || $name === '' || strlen($name) > 150 || $password === false || strlen($password) < 12
    || strlen($password) > 72 || str_contains($password, "\0") || trim($password) === '') {
    fwrite(STDERR, "Usage: php xampp/scripts/setup-admin.php USERNAME \"Full Name\". Set MMA_SETUP_PASSWORD securely (12–72 bytes).\n");
    exit(1);
}
try {
    $statement = mma_database()->prepare('INSERT INTO users (role_key,username,display_name,password_hash) VALUES (?,?,?,?)');
    $statement->execute(['admin', $username, $name, password_hash($password, PASSWORD_DEFAULT)]);
    echo "Administrator account created. Remove MMA_SETUP_PASSWORD from your environment.\n";
} catch (PDOException $exception) {
    fwrite(STDERR, "Account setup failed. Check database configuration, schema, and username availability.\n");
    exit(1);
}
