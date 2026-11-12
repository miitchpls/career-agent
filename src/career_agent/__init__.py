import os


def main() -> None:
    import uvicorn

    # HOST=0.0.0.0 to expose the UI on the local network (no auth: trusted networks only).
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("career_agent.app:app", host=host, port=port)
