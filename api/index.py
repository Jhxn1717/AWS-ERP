"""Vercel ASGI entrypoint; schema migrations run before deployment."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'Backend'))
from app.main import app
