import unittest
from pathlib import Path
from fastapi import HTTPException
from app.csv_import import detect_csv

class CsvDetectionTests(unittest.TestCase):
    def test_examples_are_recognized_even_when_renamed(self):
        samples=Path(__file__).resolve().parents[2]/'Frontend'/'public'/'samples'
        for name,kind in [('productos','products'),('clientes','customers'),('proveedores','suppliers')]:
            self.assertEqual(detect_csv((samples/(name+'-5.csv')).read_bytes(),'archivo.csv'),kind)

    def test_legacy_contacts_use_filename_without_guessing_from_ruc(self):
        content=b'nombre,tipo_documento,documento,correo,telefono\nCliente SAC,RUC,20500000001,a@example.test,999\n'
        self.assertEqual(detect_csv(content,'clientes-5.csv'),'customers')
        self.assertEqual(detect_csv(content,'proveedores-5.csv'),'suppliers')
        with self.assertRaises(HTTPException) as context:detect_csv(content,'archivo.csv')
        self.assertEqual(context.exception.status_code,422)

    def test_mixed_contact_types_and_unknown_content_are_rejected(self):
        content=b'tipo_registro,nombre,tipo_documento,documento,correo,telefono\nclientes,Ana,DNI,01234567,a@example.test,999\nproveedores,Empresa,RUC,20500000001,b@example.test,998\n'
        for value in [content,b'columna,otra\nuno,dos\n']:
            with self.assertRaises(HTTPException) as context:detect_csv(value,'clientes.csv')
            self.assertEqual(context.exception.status_code,422)
