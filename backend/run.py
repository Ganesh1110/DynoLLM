"""Backend dev server runner."""
import os
import uvicorn

if __name__ == "__main__":
    # Issue 12 fix: reload=True resets module-level state (_ACTIVE_RUNS, WS manager)
    # on every file change and must NOT run inside Docker or any multi-worker deployment.
    # Set DEV=true in your local environment to re-enable file-watching during development.
    dev_mode = os.getenv("DEV", "false").lower() == "true"

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=dev_mode,
        log_level="info",
    )
