import io
import os
import tempfile
import unittest
from unittest.mock import patch
from app.storage import LocalStorage, S3Storage, document_storage

class StorageTests(unittest.TestCase):
    def test_local_round_trip(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, DOCUMENTS_DIR=directory):
            storage=LocalStorage()
            storage.put('a'*32,b'document')
            self.assertEqual(storage.get('a'*32),b'document')
            storage.delete('a'*32)
            with self.assertRaises(FileNotFoundError):
                storage.get('a'*32)

    def test_s3_private_encrypted_round_trip(self):
        with patch.dict(os.environ,S3_DOCUMENTS_BUCKET='erp-test'), patch('boto3.client') as factory:
            storage=S3Storage()
            storage.put('a'*32,b'document')
            factory.return_value.put_object.assert_called_once_with(Bucket='erp-test',
                Key='documents/'+'a'*32, Body=b'document',ContentType='application/octet-stream',ServerSideEncryption='AES256')
            body=io.BytesIO(b'document')
            factory.return_value.get_object.return_value={'Body':body}
            self.assertEqual(storage.get('a'*32),b'document')
            self.assertTrue(body.closed)
            storage.delete('a'*32)
            factory.return_value.delete_object.assert_called_once()

    def test_invalid_provider_fails_closed(self):
        with self.assertRaises(RuntimeError):
            document_storage('unknown')
