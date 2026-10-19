"""Normalize form text before validating lengths; passwords remain exact."""
from pydantic import BaseModel, field_validator


class FormModel(BaseModel):
    @field_validator('*', mode='before')
    @classmethod
    def trim_text(cls, value, info):
        if info.field_name == 'password' and isinstance(value, str) and not value.strip():
            raise ValueError('La contraseña no puede contener solo espacios.')
        if isinstance(value, str) and info.field_name != 'password':
            return value.strip()
        return value
