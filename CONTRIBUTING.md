# Contributing to DynoLLM

Thank you for your interest in improving DynoLLM! We welcome contributions of all kinds: new LLM runtime adapters, hardware collectors, UI dashboards, bug fixes, and documentation improvements.

---

## 🛠️ Development Setup

### Backend (FastAPI + Asyncio)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

Run tests:
```bash
PYTHONPATH=. pytest tests/
```

### Frontend (React + Vite + Tailwind CSS)

```bash
cd frontend
npm install
npm run dev
```

The web UI will be available at `http://localhost:5173`.

---

## 💡 How to Contribute

1. **Fork the Repository** and clone your fork locally.
2. **Create a Feature Branch**: `git checkout -b feature/my-new-runtime-adapter`
3. **Commit your changes**: Write concise, descriptive commit messages.
4. **Test your code**: Ensure backend unit tests pass and the frontend compiles cleanly (`npm run build`).
5. **Open a Pull Request**: Provide a clear summary of your changes and any relevant screenshots.

---

## 🏷️ Code Guidelines

- **Python**: Follow PEP 8 conventions. Use type hints where possible.
- **Frontend**: Follow functional React patterns and Tailwind CSS utility classes.
- **Async Safety**: Ensure long-running benchmark or load test routines do not block the FastAPI event loop. Use async primitives and streaming generators.

---

## 💬 Community & Discussions

If you have questions, ideas, or need help, feel free to open a [GitHub Discussion](https://github.com/Ganesh1110/DynoLLM/discussions) or submit an [Issue](https://github.com/Ganesh1110/DynoLLM/issues).
