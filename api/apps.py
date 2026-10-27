from django.apps import AppConfig
from django.db.backends.signals import connection_created
from django.dispatch import receiver
import re

def py_like(pat, string, esc=None):
    if pat is None or string is None:
        return False
    pat = str(pat).lower()
    string = str(string).lower()

    # Fast path for common '%term%' queries
    if pat.startswith('%') and pat.endswith('%') and '%' not in pat[1:-1] and '_' not in pat:
        return pat[1:-1] in string

    parts = []
    i = 0
    n = len(pat)
    while i < n:
        c = pat[i]
        if esc and c == esc and i + 1 < n:
            i += 1
            parts.append(re.escape(pat[i]))
        elif c == '%':
            parts.append('.*')
        elif c == '_':
            parts.append('.')
        else:
            parts.append(re.escape(c))
        i += 1
    regex = '^' + ''.join(parts) + '$'
    try:
        return bool(re.search(regex, string, re.DOTALL))
    except Exception:
        return False

@receiver(connection_created)
def extend_sqlite_functions(sender, connection, **kwargs):
    if connection.vendor == 'sqlite':
        try:
            connection.connection.create_function('like', 2, lambda p, s: py_like(p, s))
            connection.connection.create_function('like', 3, lambda p, s, e: py_like(p, s, e))
            connection.connection.create_function('UPPER', 1, lambda s: str(s).upper() if s is not None else None)
            connection.connection.create_function('LOWER', 1, lambda s: str(s).lower() if s is not None else None)
        except Exception:
            pass

class ApiConfig(AppConfig):
    name = 'api'

    def ready(self):
        # Ensure functions are attached to existing connections if any
        from django.db import connections
        for conn in connections.all():
            if conn.vendor == 'sqlite' and conn.connection:
                try:
                    conn.connection.create_function('like', 2, lambda p, s: py_like(p, s))
                    conn.connection.create_function('like', 3, lambda p, s, e: py_like(p, s, e))
                    conn.connection.create_function('UPPER', 1, lambda s: str(s).upper() if s is not None else None)
                    conn.connection.create_function('LOWER', 1, lambda s: str(s).lower() if s is not None else None)
                except Exception:
                    pass
