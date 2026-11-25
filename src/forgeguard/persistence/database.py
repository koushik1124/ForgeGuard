from __future__ import annotations

import asyncio
import sqlite3
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any, TypeVar

from forgeguard.persistence.exceptions import DatabaseConnectionError, PersistenceError
from forgeguard.persistence.schema import init_schema

T = TypeVar("T")


class Database:
    """Async-friendly SQLite database wrapper with WAL mode and transaction safety."""

    def __init__(self, db_path: str | Path = ":memory:") -> None:
        self.db_path = str(db_path)
        self._conn: sqlite3.Connection | None = None
        self._lock = threading.Lock()
        self._async_lock = asyncio.Lock()
        self._is_closed = False

    def _create_connection(self) -> sqlite3.Connection:
        try:
            if self.db_path != ":memory:":
                Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)

            conn = sqlite3.connect(
                self.db_path,
                check_same_thread=False,
                timeout=10.0,
            )
            conn.row_factory = sqlite3.Row

            # Apply SQLite production configuration
            if self.db_path != ":memory:":
                conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA foreign_keys = ON;")
            conn.execute("PRAGMA synchronous = NORMAL;")
            conn.execute("PRAGMA busy_timeout = 5000;")

            return conn
        except Exception as exc:
            raise DatabaseConnectionError(
                f"Failed to connect to SQLite database at '{self.db_path}': {exc}"
            ) from exc

    def _sync_initialize(self) -> None:
        with self._lock:
            if self._conn is None:
                self._conn = self._create_connection()
                self._is_closed = False
                init_schema(self._conn)

    async def initialize(self) -> None:
        """Initialize database connection and ensure schema tables exist."""
        async with self._async_lock:
            if self._conn is None:
                await asyncio.to_thread(self._sync_initialize)

    def _get_connection(self) -> sqlite3.Connection:
        if self._conn is None or self._is_closed:
            raise DatabaseConnectionError("Database connection is not open or has been closed.")
        return self._conn

    def _sync_execute(
        self,
        sql: str,
        params: tuple[Any, ...] | dict[str, Any] = (),
    ) -> list[sqlite3.Row]:
        with self._lock:
            conn = self._get_connection()
            with conn:
                cursor = conn.execute(sql, params)
                return cursor.fetchall()

    async def execute(
        self,
        sql: str,
        params: tuple[Any, ...] | dict[str, Any] = (),
    ) -> list[sqlite3.Row]:
        """Execute a query within an auto-committed transaction."""
        async with self._async_lock:
            return await asyncio.to_thread(self._sync_execute, sql, params)

    def _sync_fetchone(
        self,
        sql: str,
        params: tuple[Any, ...] | dict[str, Any] = (),
    ) -> sqlite3.Row | None:
        with self._lock:
            conn = self._get_connection()
            cursor = conn.execute(sql, params)
            row: sqlite3.Row | None = cursor.fetchone()
            return row

    async def fetchone(
        self,
        sql: str,
        params: tuple[Any, ...] | dict[str, Any] = (),
    ) -> sqlite3.Row | None:
        """Fetch a single row."""
        async with self._async_lock:
            return await asyncio.to_thread(self._sync_fetchone, sql, params)

    def _sync_fetchall(
        self,
        sql: str,
        params: tuple[Any, ...] | dict[str, Any] = (),
    ) -> list[sqlite3.Row]:
        with self._lock:
            conn = self._get_connection()
            cursor = conn.execute(sql, params)
            return cursor.fetchall()

    async def fetchall(
        self,
        sql: str,
        params: tuple[Any, ...] | dict[str, Any] = (),
    ) -> list[sqlite3.Row]:
        """Fetch all rows."""
        async with self._async_lock:
            return await asyncio.to_thread(self._sync_fetchall, sql, params)

    def _sync_transaction(self, callback: Callable[[sqlite3.Connection], T]) -> T:
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    return callback(conn)
            except Exception as exc:
                if isinstance(exc, PersistenceError):
                    raise
                raise PersistenceError(f"Transaction failed: {exc}") from exc

    async def run_in_transaction(self, callback: Callable[[sqlite3.Connection], T]) -> T:
        """Execute a callable atomically within a database transaction."""
        async with self._async_lock:
            return await asyncio.to_thread(self._sync_transaction, callback)

    def _sync_close(self) -> None:
        with self._lock:
            if self._conn is not None and not self._is_closed:
                try:
                    self._conn.close()
                finally:
                    self._conn = None
                    self._is_closed = True

    async def close(self) -> None:
        """Close the database connection cleanly."""
        async with self._async_lock:
            await asyncio.to_thread(self._sync_close)

    async def __aenter__(self) -> Database:
        await self.initialize()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.close()
