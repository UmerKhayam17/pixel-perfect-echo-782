"""Communication with the Node backend.

Events go out on stdout as one JSON object per line; control commands
("pause", "resume", "cancel") come in on stdin, one per line.
"""

import asyncio
import json
import sys
import threading


def emit(event_type: str, **fields) -> None:
    sys.stdout.write(json.dumps({"type": event_type, **fields}, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def log(message: str) -> None:
    sys.stderr.write(message + "\n")
    sys.stderr.flush()


class Control:
    def __init__(self) -> None:
        self._running = threading.Event()
        self._running.set()
        self._cancelled = threading.Event()

    def listen(self) -> None:
        threading.Thread(target=self._read_stdin, daemon=True).start()

    def _read_stdin(self) -> None:
        for line in sys.stdin:
            command = line.strip()
            if command == "pause":
                self._running.clear()
                emit("status", text="Paused — press Resume to continue.")
            elif command == "resume":
                self._running.set()
            elif command == "cancel":
                self._cancelled.set()
                self._running.set()

    @property
    def cancelled(self) -> bool:
        return self._cancelled.is_set()

    async def checkpoint(self) -> bool:
        """Blocks while paused. Returns False once the search has been cancelled."""
        while not self._running.is_set():
            await asyncio.sleep(0.3)
        return not self._cancelled.is_set()
