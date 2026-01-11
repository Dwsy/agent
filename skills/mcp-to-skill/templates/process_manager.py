#!/usr/bin/env python3
"""
MCP Process Manager
===================
Manages MCP process lifecycle with heartbeat and auto-cleanup.
"""

import json
import time
import signal
import sys
import threading
from pathlib import Path
from typing import Optional, Dict, Any
from multiprocessing import Process, Queue
import subprocess


class MCPProcessManager:
    """Manages MCP process with heartbeat and auto-cleanup."""

    def __init__(self, config: Dict[str, Any], skill_dir: Path):
        self.config = config
        self.skill_dir = skill_dir
        self.keep_alive = config.get('keep_alive', {})
        self.enabled = self.keep_alive.get('enabled', True)
        self.timeout = self.keep_alive.get('timeout', 3600)  # 1 hour default
        self.check_interval = self.keep_alive.get('check_interval', 60)  # 1 minute

        self.pid_file = skill_dir / '.mcp.pid'
        self.last_active_file = skill_dir / '.mcp.last_active'

        self.process: Optional[subprocess.Popen] = None
        self.request_queue: Optional[Queue] = None
        self.response_queue: Optional[Queue] = None
        self.worker_process: Optional[Process] = None

        self._stop_event = threading.Event()
        self._monitor_thread: Optional[threading.Thread] = None

    def start(self):
        """Start the MCP process manager."""
        if not self.enabled:
            return

        self._start_monitor()
        self._start_worker()

    def stop(self):
        """Stop the MCP process manager."""
        self._stop_event.set()

        if self._monitor_thread:
            self._monitor_thread.join(timeout=5)

        if self.worker_process:
            self.worker_process.terminate()
            self.worker_process.join(timeout=5)

        if self.process:
            self.process.terminate()
            self.process.wait(timeout=5)

        self._cleanup_files()

    def update_heartbeat(self):
        """Update the last active timestamp."""
        if not self.enabled:
            return

        with open(self.last_active_file, 'w') as f:
            f.write(str(time.time()))

    def is_process_alive(self) -> bool:
        """Check if the MCP process is alive."""
        if not self.pid_file.exists():
            return False

        try:
            with open(self.pid_file, 'r') as f:
                pid = int(f.read().strip())

            # Check if process exists
            import os
            try:
                os.kill(pid, 0)
                return True
            except OSError:
                return False
        except:
            return False

    def _start_monitor(self):
        """Start the heartbeat monitor thread."""
        self._monitor_thread = threading.Thread(
            target=self._monitor_loop,
            daemon=True
        )
        self._monitor_thread.start()

    def _monitor_loop(self):
        """Monitor loop for heartbeat and cleanup."""
        while not self._stop_event.is_set():
            if self.is_process_alive():
                self._check_timeout()
            else:
                self._cleanup_files()

            time.sleep(self.check_interval)

    def _check_timeout(self):
        """Check if process should be terminated due to timeout."""
        if not self.last_active_file.exists():
            return

        try:
            with open(self.last_active_file, 'r') as f:
                last_active = float(f.read().strip())

            idle_time = time.time() - last_active

            if idle_time > self.timeout:
                print(f"[MCP Process Manager] Process idle for {idle_time:.0f}s, terminating...", file=sys.stderr)
                self._terminate_process()
        except:
            pass

    def _terminate_process(self):
        """Terminate the MCP process."""
        if self.pid_file.exists():
            try:
                with open(self.pid_file, 'r') as f:
                    pid = int(f.read().strip())

                import os
                os.kill(pid, signal.SIGTERM)
            except:
                pass

        self._cleanup_files()

    def _cleanup_files(self):
        """Cleanup PID and last active files."""
        for file in [self.pid_file, self.last_active_file]:
            if file.exists():
                try:
                    file.unlink()
                except:
                    pass

    def _start_worker(self):
        """Start the worker process."""
        if self.is_process_alive():
            return

        # Start the MCP process
        command = self.config.get('command', '')
        args = self.config.get('args', [])
        env = self.config.get('env', {})

        import os
        env = {**os.environ, **env}

        self.process = subprocess.Popen(
            [command] + args,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Write PID
        with open(self.pid_file, 'w') as f:
            f.write(str(self.process.pid))

        # Initialize last active
        self.update_heartbeat()

        print(f"[MCP Process Manager] Started process PID: {self.process.pid}", file=sys.stderr)

    def get_process(self) -> Optional[subprocess.Popen]:
        """Get or create the MCP process."""
        if not self.enabled:
            return None

        if not self.is_process_alive():
            self._start_worker()
        else:
            self.update_heartbeat()

        return self.process


# Global manager instance
_manager: Optional[MCPProcessManager] = None


def init_manager(config: Dict[str, Any], skill_dir: Path):
    """Initialize the global process manager."""
    global _manager
    _manager = MCPProcessManager(config, skill_dir)
    _manager.start()


def get_manager() -> Optional[MCPProcessManager]:
    """Get the global process manager."""
    return _manager


def shutdown_manager():
    """Shutdown the global process manager."""
    global _manager
    if _manager:
        _manager.stop()
        _manager = None