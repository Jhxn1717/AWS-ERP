"""Protect audit rows from ordinary UPDATE and DELETE statements."""
from alembic import op

revision = '0003'
down_revision = '0002'

def upgrade():
    dialect=op.get_bind().dialect.name
    if dialect == 'postgresql':
        op.execute("""CREATE FUNCTION protect_erp_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF OLD.kind = 'audit' THEN RAISE EXCEPTION 'Audit rows are append-only'; END IF;
            IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
            RETURN NEW;
        END; $$""")
        op.execute('CREATE TRIGGER protect_erp_audit BEFORE UPDATE OR DELETE ON records FOR EACH ROW EXECUTE FUNCTION protect_erp_audit()')
    elif dialect == 'sqlite':
        for action in ('UPDATE','DELETE'):
            op.execute(f"""CREATE TRIGGER protect_erp_audit_{action.lower()}
                BEFORE {action} ON records WHEN OLD.kind = 'audit'
                BEGIN SELECT RAISE(ABORT, 'Audit rows are append-only'); END""")
    else:
        raise RuntimeError('Unsupported database for audit protection')

def downgrade():
    if op.get_bind().dialect.name == 'postgresql':
        op.execute('DROP TRIGGER protect_erp_audit ON records')
        op.execute('DROP FUNCTION protect_erp_audit()')
    else:
        op.execute('DROP TRIGGER protect_erp_audit_update')
        op.execute('DROP TRIGGER protect_erp_audit_delete')
