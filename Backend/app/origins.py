"""One origin policy shared by Google login and authenticated API writes."""
import os

LOCAL_ORIGINS = ','.join(
    f'http://{host}:{port}'
    for port in (5173, 5174, 8000)
    for host in ('127.0.0.1', 'localhost')
)


def allowed_origins():
    return {origin.strip() for origin in os.getenv('ERP_ALLOWED_ORIGINS', LOCAL_ORIGINS).split(',') if origin.strip()}
