"""Verify actual RSA-signed JWTs; only the Google certificate transport is substituted."""
import json
import time
import unittest
from unittest.mock import patch

import rsa
from google.auth import crypt, jwt
from app.google_login import verify_credential

class GoogleTokenTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.public,cls.private=rsa.newkeys(2048)

    def verify(self,**overrides):
        claims={'iss':'https://accounts.google.com','aud':'erp-client','sub':'google-user',
                'iat':int(time.time()),'exp':int(time.time())+600,'email':'user@gmail.com',
                'email_verified':True,'nonce':'browser-nonce',**overrides}
        signer=crypt.RSASigner.from_string(self.private.save_pkcs1(),key_id='test-key')
        token=jwt.encode(signer,claims).decode()
        transport=type('CertResponse',(),{'status':200,'data':json.dumps({'test-key':self.public.save_pkcs1().decode()}).encode()})()
        with patch('google.auth.transport.requests.Request') as factory:
            factory.return_value.return_value=transport
            return verify_credential(token,'erp-client')

    def test_valid_signed_token(self):
        self.assertEqual(self.verify()['sub'],'google-user')

    def test_wrong_audience_expiry_and_issuer(self):
        for claim in ({'aud':'another-client'},{'exp':int(time.time())-100},{'iss':'https://evil.example'}):
            with self.subTest(claim=claim),self.assertRaises(ValueError):
                self.verify(**claim)
