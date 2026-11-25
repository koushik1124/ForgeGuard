from __future__ import annotations

import mimetypes
from pathlib import Path

# Known sensitive filenames (lowercase)
_SENSITIVE_EXACT_NAMES = {
    ".env",
    ".env.local",
    ".env.development",
    ".env.test",
    ".env.production",
    ".env.staging",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    ".git-credentials",
    ".netrc",
    "credentials.json",
    "client_secret.json",
    "service_account.json",
    "service-account.json",
    "secrets.json",
    "secrets.yaml",
    "secrets.yml",
    "htpasswd",
    "shadow",
}

# Known sensitive extensions
_SENSITIVE_EXTENSIONS = {
    ".pem",
    ".key",
    ".pkcs12",
    ".p12",
    ".pfx",
    ".kdbx",
    ".crt",
    ".der",
}

# Known binary extensions
_BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico", ".tiff", ".svgz",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".iso", ".dmg",
    ".pyc", ".pyo", ".pyd", ".class", ".jar", ".war",
    ".db", ".sqlite", ".sqlite3", ".db-shm", ".db-wal",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".mp3", ".wav", ".ogg", ".mp4", ".avi", ".mov", ".webm", ".mkv",
}


def is_hidden_path(path: str | Path) -> bool:
    """Return True if any segment of the path begins with a dot (hidden file or folder)."""
    p = Path(path)
    for part in p.parts:
        if part.startswith(".") and part not in {".", ".."}:
            return True
    return False


def is_sensitive_file(path: str | Path) -> bool:
    """Determine whether a file is a sensitive credential or secret file that must not be previewed."""
    p = Path(path)
    name_lower = p.name.lower()

    # 1. Exact sensitive filenames or env file patterns
    if name_lower in _SENSITIVE_EXACT_NAMES or name_lower.startswith(".env"):
        return True

    # 2. Sensitive cryptographic extensions
    if p.suffix.lower() in _SENSITIVE_EXTENSIONS:
        return True

    # 3. Sensitive pattern names (e.g. client_secret_123.json, aws_credentials.json)
    if any(k in name_lower for k in ("client_secret", "service_account", "service-account")):
        return True

    if "credential" in name_lower and p.suffix.lower() in {".json", ".yaml", ".yml", ".xml", ".ini", ".toml"}:
        return True

    if "secret" in name_lower and p.suffix.lower() in {".json", ".yaml", ".yml", ".key", ".txt"}:
        return True

    # 4. Any file inside sensitive directories (.ssh, .aws, .gnupg)
    for part in p.parts[:-1]:
        part_lower = part.lower()
        if part_lower in {".ssh", ".aws", ".gnupg", ".secrets"}:
            return True

    return False


def is_binary_file(filename: str, sample_bytes: bytes | None = None) -> bool:
    """Determine whether a file is binary using its extension or null-byte detection."""
    suffix = Path(filename).suffix.lower()
    if suffix in _BINARY_EXTENSIONS:
        return True

    if sample_bytes and b"\x00" in sample_bytes:
        return True

    return False


def guess_mime_type(filename: str) -> str:
    """Guess MIME type or return a safe fallback."""
    mime, _ = mimetypes.guess_type(filename)
    if mime:
        return mime
    if is_binary_file(filename):
        return "application/octet-stream"
    return "text/plain"
