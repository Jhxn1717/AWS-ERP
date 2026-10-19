"""Request logs without cookies, bodies or query strings, and database readiness."""
import json
import logging
import time
import uuid
from fastapi.responses import JSONResponse
from sqlalchemy import text

logger = logging.getLogger('uvicorn.error')

def register_observability(app, engine):
    @app.middleware('http')
    async def request_log(request, call_next):
        request_id = uuid.uuid4().hex
        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers['X-Request-ID'] = request_id
            response.headers['X-Content-Type-Options'] = 'nosniff'
            return response
        finally:
            route = request.scope.get('route')
            logger.info(json.dumps({'event':'http_request', 'requestId':request_id,
                'method':request.method, 'route':getattr(route, 'path', 'unmatched'),
                'status':status, 'durationMs':round((time.perf_counter()-start)*1000,2)}))

    @app.get('/api/v1/ready')
    def ready():
        try:
            with engine.connect() as connection:
                connection.execute(text('SELECT 1'))
            return {'status':'ready'}
        except Exception:
            return JSONResponse({'status':'unavailable'}, status_code=503)
