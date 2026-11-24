<?php
declare(strict_types=1);

/** PDO connection for the MySQL/XAMPP handoff only; not used by the Next.js preview. */
function mma_database(): PDO
{
    $host = getenv('MMA_DB_HOST') ?: '127.0.0.1';
    $port = getenv('MMA_DB_PORT') ?: '3306';
    $name = getenv('MMA_DB_NAME') ?: 'mma_intramurals';
    $user = getenv('MMA_DB_USER');
    $password = getenv('MMA_DB_PASSWORD');
    if (!$user || $password === false || !preg_match('/\A[0-9]{1,5}\z/', $port)
        || !preg_match('/\A[a-zA-Z0-9_.:-]+\z/', $host) || !preg_match('/\A[a-zA-Z0-9_]+\z/', $name)) {
        throw new RuntimeException('Set valid MMA_DB_USER, MMA_DB_PASSWORD and connection variables.');
    }
    return new PDO("mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4", $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+00:00'",
    ]);
}
