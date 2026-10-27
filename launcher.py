import os
import sys
import time
import socket
import threading
import webbrowser
from pathlib import Path

# Provide a safe dummy writer for windowed mode so loggers/print never crash
class _NullWriter:
    def write(self, *args, **kwargs): pass
    def flush(self, *args, **kwargs): pass

def setup_console():
    """
    In Windows GUI / --noconsole mode, standard handles (sys.stdout/sys.stderr) are None
    unless redirected/piped.
    If the executable was run from a console (CMD, PowerShell, terminal) without redirection,
    attach to the parent console so that CLI commands (migrate, createsuperuser, etc.)
    print their output directly to the terminal.
    """
    if sys.platform == 'win32':
        import ctypes
        kernel32 = ctypes.windll.kernel32
        ATTACH_PARENT_PROCESS = ctypes.c_ulong(0xFFFFFFFF).value

        # Only attach to console if sys.stdout or sys.stderr is None (not already redirected/piped)
        if sys.stdout is None or sys.stderr is None:
            attached = False
            try:
                if kernel32.AttachConsole(ATTACH_PARENT_PROCESS):
                    attached = True
            except Exception:
                pass

            if attached:
                try:
                    if sys.stdout is None:
                        sys.stdout = open('CONOUT$', 'w', encoding='utf-8', errors='replace', buffering=1)
                    if sys.stderr is None:
                        sys.stderr = open('CONOUT$', 'w', encoding='utf-8', errors='replace', buffering=1)
                    if sys.stdin is None:
                        sys.stdin = open('CONIN$', 'r', encoding='utf-8', errors='replace')
                except Exception:
                    pass

    if sys.stdout is None:
        sys.stdout = _NullWriter()
    if sys.stderr is None:
        sys.stderr = _NullWriter()

setup_console()

# Ensure BUNDLE_DIR or current directory is in sys.path
if getattr(sys, 'frozen', False):
    basedir = Path(sys._MEIPASS).resolve()
else:
    basedir = Path(__file__).resolve().parent

if str(basedir) not in sys.path:
    sys.path.insert(0, str(basedir))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

# Ensure Django command discovery works properly when frozen in PyInstaller
import django.core.management
_orig_get_commands = django.core.management.get_commands

DEFAULT_DJANGO_COMMANDS = {
    'check': 'django.core',
    'compilemessages': 'django.core',
    'createcachetable': 'django.core',
    'dbshell': 'django.core',
    'diffsettings': 'django.core',
    'dumpdata': 'django.core',
    'flush': 'django.core',
    'inspectdb': 'django.core',
    'loaddata': 'django.core',
    'makemessages': 'django.core',
    'makemigrations': 'django.core',
    'migrate': 'django.core',
    'optimizemigration': 'django.core',
    'runserver': 'django.core',
    'sendtestemail': 'django.core',
    'shell': 'django.core',
    'showmigrations': 'django.core',
    'sqlflush': 'django.core',
    'sqlmigrate': 'django.core',
    'sqlsequencereset': 'django.core',
    'squashmigrations': 'django.core',
    'startapp': 'django.core',
    'startproject': 'django.core',
    'test': 'django.core',
    'testserver': 'django.core',
    'createsuperuser': 'django.contrib.auth',
    'changepassword': 'django.contrib.auth',
    'collectstatic': 'django.contrib.staticfiles',
    'findstatic': 'django.contrib.staticfiles',
    'clean_duplicate_history': 'simple_history',
    'clean_old_history': 'simple_history',
    'spectacular': 'drf_spectacular',
}

def get_commands_with_fallback():
    commands = dict(_orig_get_commands())
    for cmd, app in DEFAULT_DJANGO_COMMANDS.items():
        if cmd not in commands:
            commands[cmd] = app
    return commands

django.core.management.get_commands = get_commands_with_fallback

def get_lan_ips():
    """Retrieve all local LAN IP addresses for display."""
    ips = []
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith('127.'):
                ips.append(ip)
    except Exception:
        pass
    return ips

def find_free_port(host='0.0.0.0', start_port=8000, max_attempts=20):
    """Find an available TCP port starting from start_port."""
    for p in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((host, p))
                return p
            except OSError:
                continue
    return start_port

def wait_and_open_browser(port):
    """Wait until the HTTP server is accepting connections, then launch default browser."""
    target_url = f"http://127.0.0.1:{port}/"
    for _ in range(40):
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.25):
                break
        except (OSError, ConnectionRefusedError):
            time.sleep(0.25)
    
    print(f"Opening browser at: {target_url}\n")
    webbrowser.open(target_url)

def run_auto_migrations():
    """Automatically apply any pending migrations to the SQLite database on startup."""
    try:
        from django.core.management import call_command
        print("Checking and applying database migrations...")
        call_command('migrate', interactive=False)
        print("Database schema is up to date.")
    except Exception as e:
        print(f"[Warning] Auto-migration check encountered an issue: {e}")

def ensure_default_superuser():
    """Ensure at least one admin account exists when starting with a fresh database."""
    try:
        from api.models import User
        if not User.objects.filter(is_superuser=True).exists():
            print("[INFO] No superuser found. Creating default admin user (admin / admin)...")
            User.objects.create_superuser('admin', 'admin@example.com', 'admin', role='ADMIN')
            print("[INFO] Default admin user created successfully.")
    except Exception:
        pass

def start_server(host='0.0.0.0', port=8000, auto_open=True):
    from waitress import serve
    from config.wsgi import application

    # Automatically ensure database migrations and default superuser are ready
    run_auto_migrations()
    ensure_default_superuser()

    actual_port = find_free_port(host, port)
    if actual_port != port:
        print(f"[NOTE] Port {port} is occupied; using available port {actual_port}.")
    port = actual_port

    lan_ips = get_lan_ips()
    db_location = django.conf.settings.DATABASES['default']['NAME']

    print("=" * 65)
    print("           AUTO SERVICE POS & MANAGEMENT SYSTEM")
    print("=" * 65)
    print(f" Server listening  : http://{host}:{port}/ (Default: 0.0.0.0)")
    print(f" Local Browser URL : http://localhost:{port}/")
    if lan_ips:
        print(" Network (LAN) URL :")
        for ip in lan_ips:
            print(f"   * http://{ip}:{port}/")
    print(f" Database location : {db_location}")
    print(" Press Ctrl+C in this window to stop the server.")
    print("=" * 65)

    if auto_open:
        browser_thread = threading.Thread(target=wait_and_open_browser, args=(port,), daemon=True)
        browser_thread.start()

    try:
        serve(application, host=host, port=port, threads=8, _quiet=False)
    except KeyboardInterrupt:
        print("\nStopping Auto Service system...")
        sys.exit(0)

def main():
    # If no arguments provided -> Default to starting server on 0.0.0.0:8000
    if len(sys.argv) <= 1:
        start_server(host='0.0.0.0', port=8000, auto_open=True)
        return

    first_arg = sys.argv[1].lower()

    # Special check-only verification flag
    if first_arg in ('--check-only', '--test-setup'):
        from api.models import Product, User
        print(f"Setup verification successful!")
        print(f"Products in DB: {Product.objects.count()}")
        print(f"Users in DB: {User.objects.count()}")
        return

    # Handle 'runserver' command (e.g. `auto-service.exe runserver` or `auto-service.exe runserver 0.0.0.0:8000`)
    if first_arg == 'runserver':
        host = '0.0.0.0'
        port = 8000
        if len(sys.argv) > 2:
            addr = sys.argv[2]
            if ':' in addr:
                parts = addr.split(':')
                host = parts[0] or '0.0.0.0'
                try:
                    port = int(parts[1])
                except ValueError:
                    pass
            elif addr.isdigit():
                port = int(addr)
            else:
                host = addr

        start_server(host=host, port=port, auto_open=True)
        return

    # Map user alias 'makemigrations' / 'makemigration' / 'migration' / 'migrations' -> 'migrate'
    if first_arg in ('makemigrations', 'makemigration', 'migration', 'migrations'):
        if first_arg in ('makemigrations', 'makemigration'):
            print("\n[INFO] In packaged .exe mode, all migration files are already bundled.")
            print("[INFO] Executing 'migrate' to apply database schema updates to db.sqlite3...\n")
        sys.argv[1] = 'migrate'

    # Delegate all other commands to Django's management utility (migrate, createsuperuser, shell, etc.)
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()
