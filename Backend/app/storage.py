"""Private document storage. AWS credentials use the SDK's standard provider chain."""
import os
from pathlib import Path

class LocalStorage:
    provider = 'local'
    def __init__(self):
        self.root = Path(os.getenv('DOCUMENTS_DIR', str(Path(__file__).resolve().parents[1] / 'uploads')))
    def put(self, key, content):
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / key).write_bytes(content)
    def delete(self, key):
        (self.root / key).unlink(missing_ok=True)
    def get(self, key):
        return (self.root / key).read_bytes()

class S3Storage:
    provider = 's3'
    def __init__(self):
        import boto3
        self.bucket = os.environ['S3_DOCUMENTS_BUCKET']
        self.client = boto3.client('s3')
    def put(self, key, content):
        self.client.put_object(Bucket=self.bucket, Key='documents/' + key, Body=content,
                               ContentType='application/octet-stream', ServerSideEncryption='AES256')
    def delete(self, key):
        self.client.delete_object(Bucket=self.bucket, Key='documents/' + key)
    def get(self, key):
        from botocore.exceptions import ClientError
        try:
            response = self.client.get_object(Bucket=self.bucket, Key='documents/' + key)
        except ClientError as error:
            if error.response['Error']['Code'] in {'NoSuchKey','404'}:
                raise FileNotFoundError(key) from error
            raise
        body = response['Body']
        try:
            return body.read()
        finally:
            body.close()

class DatabaseStorage:
    """Private files persisted in PostgreSQL, never on ephemeral function disks."""
    provider = 'database'

    def put(self, key, content):
        from sqlalchemy.orm import Session
        from .database import engine
        from .models import StoredFile
        with Session(engine) as session, session.begin():
            session.merge(StoredFile(key=key, content=content))

    def delete(self, key):
        from sqlalchemy.orm import Session
        from .database import engine
        from .models import StoredFile
        with Session(engine) as session, session.begin():
            row = session.get(StoredFile, key)
            if row:
                session.delete(row)

    def get(self, key):
        from sqlalchemy.orm import Session
        from .database import engine
        from .models import StoredFile
        with Session(engine) as session:
            row = session.get(StoredFile, key)
            if row is None:
                raise FileNotFoundError(key)
            return row.content


def document_storage(provider=None):
    provider = provider or os.getenv('DOCUMENT_STORAGE', 'local')
    if provider == 'local':
        return LocalStorage()
    if provider == 's3':
        return S3Storage()
    if provider == 'database':
        return DatabaseStorage()
    raise RuntimeError('DOCUMENT_STORAGE must be local, s3 or database')
