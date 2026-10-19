"""Load local configuration without overriding environment variables supplied by deployment."""
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / '.env', override=False)
