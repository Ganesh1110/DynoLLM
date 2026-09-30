"""Backend dev server runner."""
import os
import uvicorn

if __name__ == "__main__":
    # Issue 12 fix: reload=True resets module-level state (_ACTIVE_RUNS, WS manager)
    # on every file change and must NOT run inside Docker or any multi-worker deployment.
    # Set DEV=true in your local environment to re-enable file-watching during development.
    dev_mode = os.getenv("DEV", "false").lower() == "true"
    debug_mode = (os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")) or dev_mode

    # Port selection:
    # 1. Explicit PORT takes precedence if specified.
    # 2. In DEBUG mode: default to port 8000.
    # 3. Otherwise (DEBUG=false / production): default to port 8080 (avoids vLLM port 8000 collision).
    default_port = 8000 if debug_mode else 8080
    port = int(os.getenv("PORT", default_port))
    log_level = os.getenv("LOG_LEVEL", "debug" if debug_mode else "info")

    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=port,
        reload=dev_mode,
        log_level=log_level,
    )
