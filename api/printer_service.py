import os
import sys
import io
import base64
import socket
import logging
import html
from typing import List, Tuple, Optional
from django.conf import settings
from django.utils import timezone
from .models import PrinterSetting, Product, Sale

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

logger = logging.getLogger(__name__)

# Ensure media/prints directory exists for test/debug job storage
PRINTS_DIR = os.path.join(settings.MEDIA_ROOT, 'prints')
os.makedirs(PRINTS_DIR, exist_ok=True)


# ==========================================
# WINDOWS SPOOLER HELPERS VIA CTYPES
# ==========================================
def list_system_printers() -> List[str]:
    """
    Enumerate Windows printers installed on the system using winspool.drv.
    Fallback to PowerShell or empty list if not on Windows.
    """
    if sys.platform == 'win32':
        try:
            import ctypes
            from ctypes import wintypes

            winspool = ctypes.WinDLL('winspool.drv')
            PRINTER_ENUM_LOCAL = 0x00000002
            PRINTER_ENUM_CONNECTIONS = 0x00000004
            flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS

            needed = wintypes.DWORD(0)
            returned = wintypes.DWORD(0)
            winspool.EnumPrintersW(flags, None, 2, None, 0, ctypes.byref(needed), ctypes.byref(returned))

            if needed.value > 0:
                buf = (ctypes.c_byte * needed.value)()
                res = winspool.EnumPrintersW(flags, None, 2, buf, needed.value, ctypes.byref(needed), ctypes.byref(returned))
                if res:
                    class PRINTER_INFO_2W(ctypes.Structure):
                        _fields_ = [
                            ('pServerName', wintypes.LPWSTR),
                            ('pPrinterName', wintypes.LPWSTR),
                            ('pShareName', wintypes.LPWSTR),
                            ('pPortName', wintypes.LPWSTR),
                            ('pDriverName', wintypes.LPWSTR),
                            ('pComment', wintypes.LPWSTR),
                            ('pLocation', wintypes.LPWSTR),
                            ('pDevMode', ctypes.c_void_p),
                            ('pSepFile', wintypes.LPWSTR),
                            ('pPrintProcessor', wintypes.LPWSTR),
                            ('pDatatype', wintypes.LPWSTR),
                            ('pParameters', wintypes.LPWSTR),
                            ('pSecurityDescriptor', ctypes.c_void_p),
                            ('Attributes', wintypes.DWORD),
                            ('Priority', wintypes.DWORD),
                            ('DefaultPriority', wintypes.DWORD),
                            ('StartTime', wintypes.DWORD),
                            ('UntilTime', wintypes.DWORD),
                            ('Status', wintypes.DWORD),
                            ('cJobs', wintypes.DWORD),
                            ('AveragePPM', wintypes.DWORD),
                        ]

                    printers = []
                    ptr = ctypes.cast(buf, ctypes.POINTER(PRINTER_INFO_2W))
                    for i in range(returned.value):
                        name = ptr[i].pPrinterName
                        if name:
                            printers.append(name)
                    return sorted(list(set(printers)))
        except Exception as e:
            logger.warning(f"Error enumerating printers via ctypes: {e}")

    return []


def _print_to_windows_spooler(printer_name: str, doc_name: str, data: bytes) -> Tuple[bool, str]:
    """
    Sends raw bytes directly to a Windows printer queue using winspool.drv.
    """
    if sys.platform != 'win32':
        # Simulated spooler on non-Windows
        dump_path = os.path.join(PRINTS_DIR, f"{doc_name}.bin")
        with open(dump_path, 'wb') as f:
            f.write(data)
        return True, f"Simulated print written to {dump_path}"

    try:
        import ctypes
        from ctypes import wintypes

        class DOC_INFO_1W(ctypes.Structure):
            _fields_ = [
                ('pDocName', wintypes.LPWSTR),
                ('pOutputFile', wintypes.LPWSTR),
                ('pDatatype', wintypes.LPWSTR),
            ]

        winspool = ctypes.WinDLL('winspool.drv')
        hPrinter = wintypes.HANDLE()

        open_res = winspool.OpenPrinterW(printer_name, ctypes.byref(hPrinter), None)
        if not open_res:
            err_code = ctypes.GetLastError()
            return False, f"Printer '{printer_name}' ochilmadi. Xatolik kodi: {err_code}"

        try:
            # If printer name has PDF or PORTPROMPT, redirect output to a file to prevent modal dialog hang
            output_file = None
            if "PDF" in printer_name.upper():
                output_file = os.path.join(PRINTS_DIR, f"{doc_name}.pdf")

            doc_info = DOC_INFO_1W(doc_name, output_file, "RAW")
            job_id = winspool.StartDocPrinterW(hPrinter, 1, ctypes.byref(doc_info))
            if job_id <= 0:
                err_code = ctypes.GetLastError()
                return False, f"Chop etish hujjati boshlanmadi. Xatolik kodi: {err_code}"

            try:
                winspool.StartPagePrinter(hPrinter)
                written = wintypes.DWORD(0)
                write_res = winspool.WritePrinter(hPrinter, data, len(data), ctypes.byref(written))
                winspool.EndPagePrinter(hPrinter)
                if not write_res:
                    err_code = ctypes.GetLastError()
                    return False, f"Ma'lumot printerga yozilmadi. Xatolik kodi: {err_code}"
            finally:
                winspool.EndDocPrinter(hPrinter)
        finally:
            winspool.ClosePrinter(hPrinter)

        # Save last job copy for backup / debugging
        last_job_path = os.path.join(PRINTS_DIR, "last_print_job.bin")
        with open(last_job_path, 'wb') as f:
            f.write(data)

        return True, f"'{printer_name}' printeriga muvaffaqiyatli yuborildi"
    except Exception as e:
        logger.exception("Windows print spooler error")
        return False, f"Windows printer xatoligi: {str(e)}"


def print_image_to_windows_gdi(
    printer_name: str,
    doc_name: str,
    img,
    quantity: int = 1,
    label_width: int = 50,
    label_height: int = 30
) -> Tuple[bool, str]:
    """
    Prints an image directly to a Windows printer using the Windows GDI print driver subsystem.
    Applies custom DEVMODE paper dimensions so that thermal label printers feed EXACTLY 1 label per page
    and center the print area onto the physical label stock.
    """
    if sys.platform != 'win32':
        preview_path = os.path.join(PRINTS_DIR, f"{doc_name}.png")
        try:
            img.save(preview_path)
            return True, f"Simulyatsiya qilingan GDI chop fayli: {preview_path}"
        except Exception as e:
            return True, f"Simulyatsiya qilingan chop (fayl saqlanmadi: {e})"

    try:
        import ctypes
        from ctypes import wintypes

        class DEVMODEW(ctypes.Structure):
            _fields_ = [
                ('dmDeviceName', wintypes.WCHAR * 32),
                ('dmSpecVersion', wintypes.WORD),
                ('dmDriverVersion', wintypes.WORD),
                ('dmSize', wintypes.WORD),
                ('dmDriverExtra', wintypes.WORD),
                ('dmFields', wintypes.DWORD),
                ('dmOrientation', ctypes.c_short),
                ('dmPaperSize', ctypes.c_short),
                ('dmPaperLength', ctypes.c_short),
                ('dmPaperWidth', ctypes.c_short),
                ('dmScale', ctypes.c_short),
                ('dmCopies', ctypes.c_short),
                ('dmDefaultSource', ctypes.c_short),
                ('dmPrintQuality', ctypes.c_short),
                ('dmColor', ctypes.c_short),
                ('dmDuplex', ctypes.c_short),
                ('dmYResolution', ctypes.c_short),
                ('dmTTOption', ctypes.c_short),
                ('dmCollate', ctypes.c_short),
                ('dmFormName', wintypes.WCHAR * 32),
                ('dmLogPixels', wintypes.WORD),
                ('dmBitsPerPel', wintypes.DWORD),
                ('dmPelsWidth', wintypes.DWORD),
                ('dmPelsHeight', wintypes.DWORD),
                ('dmNup', wintypes.DWORD),
                ('dmDisplayFrequency', wintypes.DWORD),
                ('dmICMMethod', wintypes.DWORD),
                ('dmICMIntent', wintypes.DWORD),
                ('dmMediaType', wintypes.DWORD),
                ('dmDitherType', wintypes.DWORD),
                ('dmReserved1', wintypes.DWORD),
                ('dmReserved2', wintypes.DWORD),
                ('dmPanningWidth', wintypes.DWORD),
                ('dmPanningHeight', wintypes.DWORD),
            ]

        class BITMAPINFOHEADER(ctypes.Structure):
            _fields_ = [
                ('biSize', wintypes.DWORD),
                ('biWidth', wintypes.LONG),
                ('biHeight', wintypes.LONG),
                ('biPlanes', wintypes.WORD),
                ('biBitCount', wintypes.WORD),
                ('biCompression', wintypes.DWORD),
                ('biSizeImage', wintypes.DWORD),
                ('biXPelsPerMeter', wintypes.LONG),
                ('biYPelsPerMeter', wintypes.LONG),
                ('biClrUsed', wintypes.DWORD),
                ('biClrImportant', wintypes.DWORD),
            ]

        class DOCINFOW(ctypes.Structure):
            _fields_ = [
                ('cbSize', ctypes.c_int),
                ('lpszDocName', wintypes.LPWSTR),
                ('lpszOutput', wintypes.LPWSTR),
                ('lpszDatatype', wintypes.LPWSTR),
                ('fwType', wintypes.DWORD),
            ]

        winspool = ctypes.WinDLL('winspool.drv')
        gdi32 = ctypes.windll.gdi32

        gdi32.CreateDCW.argtypes = [wintypes.LPWSTR, wintypes.LPWSTR, wintypes.LPWSTR, ctypes.c_void_p]
        gdi32.CreateDCW.restype = wintypes.HDC
        gdi32.DeleteDC.argtypes = [wintypes.HDC]
        gdi32.DeleteDC.restype = wintypes.BOOL
        gdi32.StartDocW.argtypes = [wintypes.HDC, ctypes.POINTER(DOCINFOW)]
        gdi32.StartDocW.restype = ctypes.c_int
        gdi32.EndDoc.argtypes = [wintypes.HDC]
        gdi32.EndDoc.restype = ctypes.c_int
        gdi32.StartPage.argtypes = [wintypes.HDC]
        gdi32.StartPage.restype = ctypes.c_int
        gdi32.EndPage.argtypes = [wintypes.HDC]
        gdi32.EndPage.restype = ctypes.c_int
        gdi32.StretchDIBits.argtypes = [
            wintypes.HDC,
            ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
            ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
            ctypes.c_void_p,
            ctypes.POINTER(BITMAPINFOHEADER),
            wintypes.UINT,
            wintypes.DWORD
        ]
        gdi32.StretchDIBits.restype = ctypes.c_int
        gdi32.GetDeviceCaps.argtypes = [wintypes.HDC, ctypes.c_int]
        gdi32.GetDeviceCaps.restype = ctypes.c_int

        # Set up custom DEVMODE with exact label width & length in tenths of a mm
        hPrinter = wintypes.HANDLE()
        p_devmode = None
        devmode_buf = None
        if "PDF" not in printer_name.upper():
            if winspool.OpenPrinterW(printer_name, ctypes.byref(hPrinter), None):
                try:
                    dm_size = winspool.DocumentPropertiesW(0, hPrinter, printer_name, None, None, 0)
                    if dm_size > 0:
                        devmode_buf = (ctypes.c_byte * dm_size)()
                        if winspool.DocumentPropertiesW(0, hPrinter, printer_name, devmode_buf, None, 2) >= 0:
                            devmode = DEVMODEW.from_buffer(devmode_buf)
                            lbl_w_tenths = int((label_width or 50) * 10)
                            lbl_h_tenths = int((label_height or 30) * 10)
                            devmode.dmPaperWidth = lbl_w_tenths
                            devmode.dmPaperLength = lbl_h_tenths
                            devmode.dmFields |= (0x00000008 | 0x00000004) # DM_PAPERWIDTH | DM_PAPERLENGTH
                            devmode.dmPaperSize = 0 # Custom user size
                            p_devmode = ctypes.byref(devmode)
                finally:
                    winspool.ClosePrinter(hPrinter)

        hdc = gdi32.CreateDCW(None, printer_name, None, p_devmode)
        if not hdc:
            err = ctypes.GetLastError()
            return False, f"Windows printer '{printer_name}' uchun GDI kontekst ochilmadi (Xatolik: {err})"

        try:
            # Query actual printable resolution reported by the configured DC
            dev_w = gdi32.GetDeviceCaps(hdc, 8)   # HORZRES
            dev_h = gdi32.GetDeviceCaps(hdc, 10)  # VERTRES
            if not dev_w or dev_w <= 0:
                dev_w = int((label_width or 50) * 8)
            if not dev_h or dev_h <= 0:
                dev_h = int((label_height or 30) * 8)

            # Fit/scale label image to match printable dimensions
            if img.size != (dev_w, dev_h):
                img_scaled = img.resize((dev_w, dev_h), Image.Resampling.LANCZOS)
            else:
                img_scaled = img

            rgb = img_scaled.convert('RGB')
            w, h = rgb.size
            row_pad = (4 - ((w * 3) % 4)) % 4
            raw_bytes = bytearray()
            for y in range(h):
                for x in range(w):
                    r, g, b = rgb.getpixel((x, y))
                    raw_bytes.extend([b, g, r])
                raw_bytes.extend([0] * row_pad)

            bmi = BITMAPINFOHEADER()
            bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
            bmi.biWidth = w
            bmi.biHeight = -h  # Negative height = top-down DIB
            bmi.biPlanes = 1
            bmi.biBitCount = 24
            bmi.biCompression = 0
            bmi.biSizeImage = len(raw_bytes)
            raw_buf = (ctypes.c_char * len(raw_bytes)).from_buffer(raw_bytes)

            output_file = None
            if "PDF" in printer_name.upper():
                output_file = os.path.join(PRINTS_DIR, f"{doc_name}.pdf")

            quantity = max(1, int(quantity))
            docinfo = DOCINFOW()
            docinfo.cbSize = ctypes.sizeof(DOCINFOW)
            docinfo.lpszDocName = doc_name
            docinfo.lpszOutput = output_file
            docinfo.lpszDatatype = None
            docinfo.fwType = 0

            s_doc = gdi32.StartDocW(hdc, ctypes.byref(docinfo))
            if s_doc <= 0:
                err = ctypes.GetLastError()
                return False, f"StartDocW xatoligi: {err}"

            try:
                SRC_COPY = 0x00CC0020
                for _ in range(quantity):
                    gdi32.StartPage(hdc)
                    gdi32.StretchDIBits(
                        hdc,
                        0, 0, dev_w, dev_h,
                        0, 0, w, h,
                        ctypes.cast(raw_buf, ctypes.c_void_p),
                        ctypes.byref(bmi),
                        0,
                        SRC_COPY
                    )
                    gdi32.EndPage(hdc)
            finally:
                gdi32.EndDoc(hdc)

            # Save debug copy of last label
            try:
                img_scaled.save(os.path.join(PRINTS_DIR, "last_barcode_label.png"))
            except Exception:
                pass

            return True, f"'{printer_name}' printeriga muvaffaqiyatli chop etildi ({quantity} dona)"
        finally:
            gdi32.DeleteDC(hdc)

    except Exception as e:
        logger.exception("Windows GDI print error")
        return False, f"Windows GDI chop etish xatoligi: {str(e)}"


def _print_to_network(ip_address: str, port: int, data: bytes) -> Tuple[bool, str]:
    """
    Sends raw bytes directly to a network printer via TCP socket (port 9100).
    """
    if not ip_address:
        return False, "Printer IP manzili ko'rsatilmagan"

    port = port or 9100
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(5.0)
            s.connect((ip_address, port))
            s.sendall(data)
        return True, f"Tarmoq printeriga ({ip_address}:{port}) muvaffaqiyatli yuborildi"
    except (socket.timeout, socket.error) as e:
        logger.warning(f"Network print error on {ip_address}:{port}: {e}")
        return False, f"Tarmoq printeriga ulanib bo'lmadi ({ip_address}:{port}): {str(e)}"


def send_raw_to_printer(setting: PrinterSetting, data: bytes, doc_name: str = "PrintJob") -> Tuple[bool, str]:
    """
    Dispatches a raw print job to the target printer based on the PrinterSetting configuration.
    """
    if not setting or not setting.is_enabled:
        return True, "Printer o'chirilgan (Disabled)"

    if setting.connection_type == 'DISABLED':
        return True, "Printer sozlamalarda faolsizlantirilgan"

    if setting.connection_type == 'WINDOWS':
        if not setting.printer_name:
            return False, f"'{setting.name or setting.printer_type}' uchun Windows printer nomi tanlanmagan"
        return _print_to_windows_spooler(setting.printer_name, doc_name, data)

    elif setting.connection_type == 'NETWORK':
        return _print_to_network(setting.ip_address, setting.port, data)

    return False, f"Noma'lum ulanish turi: {setting.connection_type}"


# ==========================================
# ESC/POS & TSPL FORMATTING ENGINES
# ==========================================

# ESC/POS byte commands
ESC_INIT = b'\x1b@'
ESC_ALIGN_LEFT = b'\x1ba\x00'
ESC_ALIGN_CENTER = b'\x1ba\x01'
ESC_ALIGN_RIGHT = b'\x1ba\x02'
ESC_BOLD_ON = b'\x1bE\x01'
ESC_BOLD_OFF = b'\x1bE\x00'
ESC_DOUBLE_HEIGHT = b'\x1d!\x01'
ESC_DOUBLE_SIZE = b'\x1d!\x11'
ESC_NORMAL_SIZE = b'\x1d!\x00'
ESC_CUT = b'\n\n\n\x1d\x56\x41\x10'  # GS V 65 16 - Feed and cut


def _justify(left_text: str, right_text: str, width: int = 42) -> str:
    """Formats two texts aligned to the left and right borders of a receipt line."""
    left_str = str(left_text)
    right_str = str(right_text)
    space_needed = width - len(left_str) - len(right_str)
    if space_needed < 1:
        # truncate or separate
        return f"{left_str}\n{right_str.rjust(width)}"
    return f"{left_str}{' ' * space_needed}{right_str}"


def _get_font(size: int, bold: bool = False):
    """Loads system TrueType font for crystal-clear thermal raster printing."""
    font_paths = [
        'C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf',
        'C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf',
        'C:/Windows/Fonts/tahomabd.ttf' if bold else 'C:/Windows/Fonts/tahoma.ttf',
    ]
    for p in font_paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    try:
        return ImageFont.load_default()
    except Exception:
        return None


def _wrap_text(text: str, font, max_width: int, draw: ImageDraw.Draw) -> List[str]:
    """Wraps product names cleanly inside the table column without overflowing borders."""
    words = str(text).split()
    if not words:
        return [""]
    lines = []
    current_line = []
    for word in words:
        test_line = ' '.join(current_line + [word])
        bbox = draw.textbbox((0, 0), test_line, font=font)
        if (bbox[2] - bbox[0]) <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(' '.join(current_line))
                current_line = [word]
            else:
                lines.append(word)
    if current_line:
        lines.append(' '.join(current_line))
    return lines or [str(text)]


def render_cashier_receipt_image(
    sale_id: str or int,
    time_str: str,
    date_str: str,
    client_name: str,
    items: list,  # list of (name, qty_val, price_val)
    total_amount: float,
    discount: float,
    address: str = "JIzzax SH. Bunyodkor mahalla mo'ljal: odvanchik",
    phone: str = "+998970254565",
    is_58: bool = False
) -> Image.Image:
    """
    Renders an exact pixel-perfect graphical receipt matching the user sketch:
    - Large, thick, prominent AUTO LUX SERVICE title
    - Crisp solid double lines (non-rough, zero jaggedness)
    - Perfectly symmetrical table grid with solid 2px borders
    - 'No' header (letters N and o, NOT corrupted symbol)
    - Proportional text size hierarchy (header huge, items clear, address/phone smaller)
    """
    width = 384 if is_58 else 576
    margin_x = 12 if is_58 else 24
    content_w = width - (2 * margin_x)

    f_scale = 0.82 if is_58 else 1.0
    f_title = _get_font(int(38 * f_scale), bold=True)
    f_sub = _get_font(int(20 * f_scale), bold=False)
    f_sub_bold = _get_font(int(20 * f_scale), bold=True)
    f_tbl_hdr = _get_font(int(20 * f_scale), bold=True)
    f_tbl_body = _get_font(int(19 * f_scale), bold=False)
    f_tbl_bold = _get_font(int(19 * f_scale), bold=True)
    f_total = _get_font(int(23 * f_scale), bold=True)
    f_meta = _get_font(int(20 * f_scale), bold=False)  # +10% more size increase for address & phone (20px)
    f_footer = _get_font(int(22 * f_scale), bold=False)

    if is_58:
        col_no_w = 28
        col_soni_w = 38
        col_narxi_w = 78
        col_jami_w = 84
        col_nomi_w = content_w - col_no_w - col_soni_w - col_narxi_w - col_jami_w
    else:
        col_no_w = 38
        col_soni_w = 54
        col_narxi_w = 104
        col_jami_w = 114
        col_nomi_w = content_w - col_no_w - col_soni_w - col_narxi_w - col_jami_w

    col_x0 = margin_x
    col_x1 = col_x0 + col_no_w
    col_x2 = col_x1 + col_nomi_w
    col_x3 = col_x2 + col_soni_w
    col_x4 = col_x3 + col_narxi_w
    col_x5 = width - margin_x

    canvas_h = 1700
    img = Image.new('RGB', (width, canvas_h), 'white')
    draw = ImageDraw.Draw(img)

    y = 16
    # 1. Header: AUTO LUX SERVICE (Large, extra bold, centered, +10% size)
    title_text = 'AUTO LUX SERVICE'
    bbox = draw.textbbox((0, 0), title_text, font=f_title)
    tw = bbox[2] - bbox[0]
    draw.text(((width - tw) // 2, y), title_text, fill='black', font=f_title)
    y += (bbox[3] - bbox[1]) + 15

    # 2. Double Solid Line (Silky smooth, symmetrical, solid black bars)
    draw.line([(margin_x, y), (width - margin_x, y)], fill='black', width=3)
    y += 5
    draw.line([(margin_x, y), (width - margin_x, y)], fill='black', width=3)
    y += 13

    # 3. Time (left) and Date (right) (+10% size)
    draw.text((margin_x, y), time_str, fill='black', font=f_sub_bold)
    d_bbox = draw.textbbox((0, 0), date_str, font=f_sub_bold)
    draw.text((width - margin_x - (d_bbox[2] - d_bbox[0]), y), date_str, fill='black', font=f_sub_bold)
    y += (d_bbox[3] - d_bbox[1]) + 11

    # 4. Mijoz (left) and chek (right) - if mijoz not present, left blank!
    client_str = str(client_name).strip() if client_name else ""
    c_text = f'Mijoz: {client_str}' if client_str else 'Mijoz:'
    chk_text = f'chek: {sale_id}'
    draw.text((margin_x, y), c_text, fill='black', font=f_sub)
    chk_bbox = draw.textbbox((0, 0), chk_text, font=f_sub_bold)
    draw.text((width - margin_x - (chk_bbox[2] - chk_bbox[0]), y), chk_text, fill='black', font=f_sub_bold)
    y += (chk_bbox[3] - chk_bbox[1]) + 15

    # 5. Table Grid: No | nomi | soni | narxi | jami (+10% size)
    header_h = 38 if is_58 else 42
    draw.rectangle([(col_x0, y), (col_x5, y + header_h)], outline='black', width=2)
    draw.line([(col_x1, y), (col_x1, y + header_h)], fill='black', width=2)
    draw.line([(col_x2, y), (col_x2, y + header_h)], fill='black', width=2)
    draw.line([(col_x3, y), (col_x3, y + header_h)], fill='black', width=2)
    draw.line([(col_x4, y), (col_x4, y + header_h)], fill='black', width=2)

    no_bb = draw.textbbox((0, 0), 'No', font=f_tbl_hdr)
    draw.text((col_x0 + (col_no_w - (no_bb[2] - no_bb[0])) // 2, y + 7), 'No', fill='black', font=f_tbl_hdr)
    draw.text((col_x1 + 8, y + 7), 'nomi', fill='black', font=f_tbl_hdr)
    s_bb = draw.textbbox((0, 0), 'soni', font=f_tbl_hdr)
    draw.text((col_x2 + (col_soni_w - (s_bb[2] - s_bb[0])) // 2, y + 7), 'soni', fill='black', font=f_tbl_hdr)
    p_bb = draw.textbbox((0, 0), 'narxi', font=f_tbl_hdr)
    draw.text((col_x4 - (p_bb[2] - p_bb[0]) - 6, y + 7), 'narxi', fill='black', font=f_tbl_hdr)
    j_bb = draw.textbbox((0, 0), 'jami', font=f_tbl_hdr)
    draw.text((col_x5 - (j_bb[2] - j_bb[0]) - 6, y + 7), 'jami', fill='black', font=f_tbl_hdr)

    y += header_h

    # Table rows (+10% font size & line height)
    line_h = 20 if is_58 else 24
    for idx, item_data in enumerate(items, start=1):
        if len(item_data) >= 4:
            p_name, qty_val, price_val, total_val = item_data[0], item_data[1], item_data[2], item_data[3]
        else:
            p_name, qty_val, price_val = item_data[0], item_data[1], item_data[2]
            try:
                total_val = float(qty_val) * float(price_val)
            except Exception:
                total_val = price_val

        wrapped = _wrap_text(p_name, f_tbl_body, col_nomi_w - 14, draw)
        row_h = max(34 if is_58 else 38, 10 + len(wrapped) * line_h)
        r_top = y

        draw.rectangle([(col_x0, r_top), (col_x5, r_top + row_h)], outline='black', width=2)
        draw.line([(col_x1, r_top), (col_x1, r_top + row_h)], fill='black', width=2)
        draw.line([(col_x2, r_top), (col_x2, r_top + row_h)], fill='black', width=2)
        draw.line([(col_x3, r_top), (col_x3, r_top + row_h)], fill='black', width=2)
        draw.line([(col_x4, r_top), (col_x4, r_top + row_h)], fill='black', width=2)

        # No (centered)
        idx_bb = draw.textbbox((0, 0), str(idx), font=f_tbl_body)
        draw.text((col_x0 + (col_no_w - (idx_bb[2] - idx_bb[0])) // 2, r_top + 6), str(idx), fill='black', font=f_tbl_body)

        # nomi (left-aligned)
        for line_i, line_text in enumerate(wrapped):
            draw.text((col_x1 + 8, r_top + 6 + (line_i * line_h)), line_text, fill='black', font=f_tbl_body)

        # soni (centered)
        q_str = str(qty_val)
        q_bb = draw.textbbox((0, 0), q_str, font=f_tbl_body)
        draw.text((col_x2 + (col_soni_w - (q_bb[2] - q_bb[0])) // 2, r_top + 6), q_str, fill='black', font=f_tbl_body)

        # narxi (unit price right-aligned)
        try:
            pr_str = f"{float(price_val):,.0f}"
        except (ValueError, TypeError):
            pr_str = str(price_val)
        pr_bb = draw.textbbox((0, 0), pr_str, font=f_tbl_body)
        draw.text((col_x4 - (pr_bb[2] - pr_bb[0]) - 6, r_top + 6), pr_str, fill='black', font=f_tbl_body)

        # jami (sum price right-aligned, bold)
        try:
            tot_str = f"{float(total_val):,.0f}"
        except (ValueError, TypeError):
            tot_str = str(total_val)
        tot_bb = draw.textbbox((0, 0), tot_str, font=f_tbl_bold)
        draw.text((col_x5 - (tot_bb[2] - tot_bb[0]) - 6, r_top + 6), tot_str, fill='black', font=f_tbl_bold)

        y += row_h

    y += 14
    # 6. Jami and Chegirma (Bold, prominent, +10% size)
    j_text = f"Jami: {float(total_amount):,.0f}"
    ch_text = f"Chegirma: {float(discount):,.0f}"
    draw.text((margin_x, y), j_text, fill='black', font=f_total)
    ch_bb = draw.textbbox((0, 0), ch_text, font=f_total)
    draw.text((width - margin_x - (ch_bb[2] - ch_bb[0]), y), ch_text, fill='black', font=f_total)
    y += (ch_bb[3] - ch_bb[1]) + 10

    # 7. Solid Line (Thick horizontal bar)
    draw.line([(margin_x, y), (width - margin_x, y)], fill='black', width=3)
    y += 14

    # 8. xaridingiz uchun rahmat (Centered - NOT at bottom)
    foot_text = 'xaridingiz uchun rahmat'
    f_bb = draw.textbbox((0, 0), foot_text, font=f_footer)
    draw.text(((width - (f_bb[2] - f_bb[0])) // 2, y), foot_text, fill='black', font=f_footer)
    y += (f_bb[3] - f_bb[1]) + 16

    # 9. manzil and telefon raqam (+10% more size, at bottom)
    m_text = f"manzil: {address}"
    t_text = f"telefon raqam: {phone}"
    m_bb = draw.textbbox((0, 0), m_text, font=f_meta)
    t_bb = draw.textbbox((0, 0), t_text, font=f_meta)
    m_w = m_bb[2] - m_bb[0]
    t_w = t_bb[2] - t_bb[0]

    if margin_x + m_w + 12 > width - margin_x - t_w:
        draw.text((margin_x, y), m_text, fill='black', font=f_meta)
        y += (m_bb[3] - m_bb[1]) + 6
        draw.text((margin_x, y), t_text, fill='black', font=f_meta)
        y += (t_bb[3] - t_bb[1]) + 30
    else:
        draw.text((margin_x, y), m_text, fill='black', font=f_meta)
        draw.text((width - margin_x - t_w, y), t_text, fill='black', font=f_meta)
        y += max(m_bb[3] - m_bb[1], t_bb[3] - t_bb[1]) + 30

    return img.crop((0, 0, width, y))


def image_to_escpos_raster(img: Image.Image) -> bytes:
    """
    Converts a PIL Image to ESC/POS raster bit image commands (GS v 0).
    Slices into chunks of 128 rows to prevent buffer overflows on thermal printers.
    """
    mono = img.convert('L').point(lambda x: 0 if x < 160 else 255, '1')
    width, height = mono.size
    width_bytes = (width + 7) // 8
    aligned_width = width_bytes * 8
    if aligned_width != width:
        new_img = Image.new('1', (aligned_width, height), 1)
        new_img.paste(mono, (0, 0))
        mono = new_img
        width = aligned_width

    buf = bytearray()
    buf.extend(ESC_INIT)
    buf.extend(ESC_ALIGN_CENTER)

    chunk_h = 128
    for y_offset in range(0, height, chunk_h):
        h = min(chunk_h, height - y_offset)
        box = (0, y_offset, width, y_offset + h)
        chunk_img = mono.crop(box)
        raw_bytes = chunk_img.tobytes()
        raster_data = bytes([~b & 0xFF for b in raw_bytes])
        xL = width_bytes % 256
        xH = width_bytes // 256
        yL = h % 256
        yH = h // 256
        buf.extend(b'\x1dv0\x00' + bytes([xL, xH, yL, yH]) + raster_data)

    buf.extend(ESC_CUT)
    return bytes(buf)


def format_cashier_cheque_text(sale: Sale, setting: Optional[PrinterSetting] = None) -> bytes:
    """
    Text-based fallback format for cashier receipt with 5 columns: 'No | nomi | soni | narxi | jami'.
    """
    is_58 = (setting and setting.paper_width == '58MM')
    w = 32 if is_58 else 48
    if is_58:
        w0, w1, w2, w3, w4 = (2, 8, 3, 6, 6)
    else:
        w0, w1, w2, w3, w4 = (3, 16, 5, 9, 9)

    sep = '+' + '-'*w0 + '+' + '-'*w1 + '+' + '-'*w2 + '+' + '-'*w3 + '+' + '-'*w4 + '+'
    double_sep = '=' * w

    def row(c0, c1, c2, c3, c4):
        return (
            '|' + str(c0).center(w0) +
            '|' + (' ' + str(c1)).ljust(w1)[:w1] +
            '|' + str(c2).center(w2) +
            '|' + (str(c3) + ' ').rjust(w3)[:w3] +
            '|' + (str(c4) + ' ').rjust(w4)[:w4] +
            '|'
        )

    buf = bytearray()
    buf.extend(ESC_INIT)

    # 1. Header: AUTO LUX SERVICE
    buf.extend(ESC_ALIGN_CENTER)
    buf.extend(ESC_BOLD_ON)
    buf.extend(ESC_DOUBLE_SIZE)
    buf.extend("AUTO LUX SERVICE\n".encode('utf-8'))
    buf.extend(ESC_NORMAL_SIZE)
    buf.extend(ESC_BOLD_OFF)

    # 2. Double Line
    buf.extend(ESC_ALIGN_LEFT)
    buf.extend(f"{double_sep}\n".encode('utf-8'))

    # 3. Time (left) and Date (right)
    sale_dt = getattr(sale, 'datetime', None) or timezone.now()
    time_str = sale_dt.strftime('%H:%M')
    date_str = sale_dt.strftime('%d.%m.%Y')
    buf.extend(_justify(time_str, date_str, w).encode('utf-8') + b'\n')

    # 4. Mijoz (left) and chek (right) - if mijoz not present, left blank!
    client_name = sale.client.name.strip() if (sale.client and sale.client.name) else ""
    client_str = f"Mijoz: {client_name}" if client_name else "Mijoz:"
    chek_str = f"chek: {sale.id}"
    buf.extend(_justify(client_str, chek_str, w).encode('utf-8') + b'\n')

    # 5. Table Grid with No | nomi | soni | narxi | jami
    buf.extend(f"{sep}\n".encode('utf-8'))
    buf.extend(ESC_BOLD_ON)
    buf.extend(row('No', 'nomi', 'soni', 'narxi', 'jami').encode('utf-8') + b'\n')
    buf.extend(ESC_BOLD_OFF)
    buf.extend(f"{sep}\n".encode('utf-8'))

    items = list(sale.items.all().select_related('product'))
    services = list(sale.services.all().select_related('worker')) if hasattr(sale, 'services') else []
    items_sum = 0
    row_idx = 1

    for item in items:
        p_name = item.product.name if item.product else f"Mahsulot #{item.product_id}"
        qty = float(item.quantity)
        qty_str = f"{qty:g}"
        item_total = float(item.total)
        items_sum += item_total
        unit_price = float(getattr(item, 'price', 0) or (item.total / qty if qty else item.total))
        narxi_str = f"{unit_price:,.0f}"
        jami_str = f"{item_total:,.0f}"

        if len(p_name) > w1 - 1:
            part1 = p_name[:w1 - 1]
            part2 = p_name[w1 - 1:2 * (w1 - 1)].strip()
            buf.extend(row(row_idx, part1, qty_str, narxi_str, jami_str).encode('utf-8') + b'\n')
            if part2:
                buf.extend(row('', part2, '', '', '').encode('utf-8') + b'\n')
        else:
            buf.extend(row(row_idx, p_name, qty_str, narxi_str, jami_str).encode('utf-8') + b'\n')
        buf.extend(f"{sep}\n".encode('utf-8'))
        row_idx += 1

    for svc in services:
        w_tag = f" ({svc.worker.first_name})" if (svc.worker and svc.worker.first_name) else ""
        s_name = f"{svc.service_name}{w_tag}"
        s_amt = float(svc.amount)
        items_sum += s_amt
        narxi_str = f"{s_amt:,.0f}"
        jami_str = narxi_str

        if len(s_name) > w1 - 1:
            part1 = s_name[:w1 - 1]
            part2 = s_name[w1 - 1:2 * (w1 - 1)].strip()
            buf.extend(row(row_idx, part1, "1", narxi_str, jami_str).encode('utf-8') + b'\n')
            if part2:
                buf.extend(row('', part2, '', '', '').encode('utf-8') + b'\n')
        else:
            buf.extend(row(row_idx, s_name, "1", narxi_str, jami_str).encode('utf-8') + b'\n')
        buf.extend(f"{sep}\n".encode('utf-8'))
        row_idx += 1

    # 6. Jami and Chegirma
    total_amount = float(sale.total_amount or items_sum)
    discount = max(0, items_sum - total_amount)
    buf.extend(ESC_BOLD_ON)
    buf.extend(_justify(f"Jami: {total_amount:,.0f}", f"Chegirma: {discount:,.0f}", w).encode('utf-8') + b'\n')
    buf.extend(ESC_BOLD_OFF)

    # 7. Double Line
    buf.extend(f"{double_sep}\n".encode('utf-8'))

    # 8. Centered note: xaridingiz uchun rahmat (NOT at bottom)
    buf.extend(ESC_ALIGN_CENTER)
    buf.extend("xaridingiz uchun rahmat\n".encode('utf-8'))
    buf.extend(ESC_ALIGN_LEFT)

    # 9. manzil and telefon raqam (at bottom)
    manzil_str = "manzil: JIzzax SH. Bunyodkor mahalla mo'ljal: odvanchik"
    tel_str = "telefon raqam: +998970254565"
    buf.extend(_justify(manzil_str, tel_str, w).encode('utf-8') + b'\n')

    # 10. Cut paper
    buf.extend(ESC_CUT)
    return bytes(buf)


def format_cashier_cheque_image(sale: Sale, setting: Optional[PrinterSetting] = None) -> bytes:
    """
    Renders the cashier receipt as a crisp, solid-lined ESC/POS graphic raster image.
    """
    is_58 = (setting and setting.paper_width == '58MM')
    sale_dt = getattr(sale, 'datetime', None) or timezone.now()
    time_str = sale_dt.strftime('%H:%M')
    date_str = sale_dt.strftime('%d.%m.%Y')
    client_name = sale.client.name.strip() if (sale.client and sale.client.name) else ""

    items_data = []
    items_sum = 0
    for item in sale.items.all().select_related('product'):
        p_name = item.product.name if item.product else f"Mahsulot #{item.product_id}"
        qty = float(item.quantity)
        qty_str = f"{qty:g}"
        item_total = float(item.total)
        items_sum += item_total
        unit_price = float(getattr(item, 'price', 0) or (item.total / qty if qty else item.total))
        items_data.append((p_name, qty_str, unit_price, item_total))

    for svc in (sale.services.all().select_related('worker') if hasattr(sale, 'services') else []):
        w_tag = f" ({svc.worker.first_name})" if (svc.worker and svc.worker.first_name) else ""
        s_name = f"{svc.service_name}{w_tag}"
        s_amt = float(svc.amount)
        items_sum += s_amt
        items_data.append((s_name, "1", s_amt, s_amt))

    total_amount = float(sale.total_amount or items_sum)
    discount = max(0, items_sum - total_amount)

    img = render_cashier_receipt_image(
        sale_id=sale.id,
        time_str=time_str,
        date_str=date_str,
        client_name=client_name,
        items=items_data,
        total_amount=total_amount,
        discount=discount,
        address="JIzzax SH. Bunyodkor mahalla mo'ljal: odvanchik",
        phone="+998970254565",
        is_58=is_58
    )
    return image_to_escpos_raster(img)


def format_cashier_cheque(sale: Sale, setting: Optional[PrinterSetting] = None) -> bytes:
    """
    Generates a Cashier receipt matching the requested template:
    - Primary mode: High-fidelity graphical raster print (silky smooth solid lines, symmetrical box grid, 'No' header)
    - Fallback mode: ESC/POS text mode
    """
    if setting and setting.command_type == 'RAW_TEXT':
        return format_cashier_cheque_text(sale, setting)

    if HAS_PIL:
        try:
            return format_cashier_cheque_image(sale, setting)
        except Exception as e:
            logger.warning(f"Error rendering raster cashier receipt, falling back to text: {e}")
            return format_cashier_cheque_text(sale, setting)

    return format_cashier_cheque_text(sale, setting)


def render_worker_receipt_image(
    sale_id: str or int,
    time_str: str,
    date_str: str,
    client_name: str,
    car_info: str,
    items: list,  # list of (name, qty_val)
    address: str = "JIzzax SH. Bunyodkor mahalla mo'ljal: odvanchik",
    phone: str = "+998970254565",
    is_58: bool = False
) -> Image.Image:
    """
    Renders worker ticket matching the cashier aesthetic:
    - Same crisp AUTO LUX SERVICE header & solid double lines
    - Same table grid styling: 'No | nomi | soni' (WITHOUT price)
    - Worker completion / checkoff lines
    - Address and phone at the bottom
    """
    width = 384 if is_58 else 576
    margin_x = 12 if is_58 else 24
    content_w = width - (2 * margin_x)

    f_scale = 0.82 if is_58 else 1.0
    f_title = _get_font(int(38 * f_scale), bold=True)
    f_sub = _get_font(int(20 * f_scale), bold=False)
    f_sub_bold = _get_font(int(20 * f_scale), bold=True)
    f_tbl_hdr = _get_font(int(20 * f_scale), bold=True)
    f_tbl_body = _get_font(int(19 * f_scale), bold=False)
    f_meta = _get_font(int(20 * f_scale), bold=False)

    if is_58:
        col_no_w = 36
        col_soni_w = 60
        col_nomi_w = content_w - col_no_w - col_soni_w
    else:
        col_no_w = 48
        col_soni_w = 84
        col_nomi_w = content_w - col_no_w - col_soni_w

    col_x0 = margin_x
    col_x1 = col_x0 + col_no_w
    col_x2 = col_x1 + col_nomi_w
    col_x3 = width - margin_x

    canvas_h = 1600
    img = Image.new('RGB', (width, canvas_h), 'white')
    draw = ImageDraw.Draw(img)

    y = 16
    # 1. Header: AUTO LUX SERVICE
    title_text = 'AUTO LUX SERVICE'
    bbox = draw.textbbox((0, 0), title_text, font=f_title)
    tw = bbox[2] - bbox[0]
    draw.text(((width - tw) // 2, y), title_text, fill='black', font=f_title)
    y += (bbox[3] - bbox[1]) + 15

    # 2. Double Solid Line
    draw.line([(margin_x, y), (width - margin_x, y)], fill='black', width=3)
    y += 5
    draw.line([(margin_x, y), (width - margin_x, y)], fill='black', width=3)
    y += 13

    # 3. Time (left) and Date (right)
    draw.text((margin_x, y), time_str, fill='black', font=f_sub_bold)
    d_bbox = draw.textbbox((0, 0), date_str, font=f_sub_bold)
    draw.text((width - margin_x - (d_bbox[2] - d_bbox[0]), y), date_str, fill='black', font=f_sub_bold)
    y += (d_bbox[3] - d_bbox[1]) + 11

    # 4. Mijoz (left) and chek (right) - if mijoz not present, left blank!
    client_str = str(client_name).strip() if client_name else ""
    c_text = f'Mijoz: {client_str}' if client_str else 'Mijoz:'
    chk_text = f'chek: {sale_id}'
    draw.text((margin_x, y), c_text, fill='black', font=f_sub)
    chk_bbox = draw.textbbox((0, 0), chk_text, font=f_sub_bold)
    draw.text((width - margin_x - (chk_bbox[2] - chk_bbox[0]), y), chk_text, fill='black', font=f_sub_bold)
    y += (chk_bbox[3] - chk_bbox[1]) + 11

    # 4b. Car info (if available)
    if car_info:
        car_text = f'Avto: {car_info}'
        draw.text((margin_x, y), car_text, fill='black', font=f_sub_bold)
        cr_bbox = draw.textbbox((0, 0), car_text, font=f_sub_bold)
        y += (cr_bbox[3] - cr_bbox[1]) + 13
    else:
        y += 4

    # 5. Table Grid: No | nomi | soni (WITHOUT price!)
    header_h = 38 if is_58 else 42
    draw.rectangle([(col_x0, y), (col_x3, y + header_h)], outline='black', width=2)
    draw.line([(col_x1, y), (col_x1, y + header_h)], fill='black', width=2)
    draw.line([(col_x2, y), (col_x2, y + header_h)], fill='black', width=2)

    no_bb = draw.textbbox((0, 0), 'No', font=f_tbl_hdr)
    draw.text((col_x0 + (col_no_w - (no_bb[2] - no_bb[0])) // 2, y + 7), 'No', fill='black', font=f_tbl_hdr)
    draw.text((col_x1 + 8, y + 7), 'nomi', fill='black', font=f_tbl_hdr)
    s_bb = draw.textbbox((0, 0), 'soni', font=f_tbl_hdr)
    draw.text((col_x2 + (col_soni_w - (s_bb[2] - s_bb[0])) // 2, y + 7), 'soni', fill='black', font=f_tbl_hdr)

    y += header_h

    # Table rows
    line_h = 20 if is_58 else 24
    for idx, (p_name, qty_val) in enumerate(items, start=1):
        wrapped = _wrap_text(p_name, f_tbl_body, col_nomi_w - 14, draw)
        row_h = max(34 if is_58 else 38, 10 + len(wrapped) * line_h)
        r_top = y

        draw.rectangle([(col_x0, r_top), (col_x3, r_top + row_h)], outline='black', width=2)
        draw.line([(col_x1, r_top), (col_x1, r_top + row_h)], fill='black', width=2)
        draw.line([(col_x2, r_top), (col_x2, r_top + row_h)], fill='black', width=2)

        # No (centered)
        idx_bb = draw.textbbox((0, 0), str(idx), font=f_tbl_body)
        draw.text((col_x0 + (col_no_w - (idx_bb[2] - idx_bb[0])) // 2, r_top + 6), str(idx), fill='black', font=f_tbl_body)

        # nomi (left-aligned)
        for line_i, line_text in enumerate(wrapped):
            draw.text((col_x1 + 8, r_top + 6 + (line_i * line_h)), line_text, fill='black', font=f_tbl_body)

        # soni (centered)
        q_str = str(qty_val)
        q_bb = draw.textbbox((0, 0), q_str, font=f_tbl_body)
        draw.text((col_x2 + (col_soni_w - (q_bb[2] - q_bb[0])) // 2, r_top + 6), q_str, fill='black', font=f_tbl_body)

        y += row_h

    y += 14
    # 6. Solid Line (Thick horizontal bar)
    draw.line([(margin_x, y), (width - margin_x, y)], fill='black', width=3)
    y += 14

    # 7. Worker checkoff & signature lines
    draw.text((margin_x, y), "Mas'ul usta: ________________________", fill='black', font=f_sub)
    y += 30
    draw.text((margin_x, y), "Holati:  [  ] Bajarildi   [  ] Jarayonda", fill='black', font=f_sub)
    y += 34

    # 8. Solid Line
    draw.line([(margin_x, y), (width - margin_x, y)], fill='black', width=3)
    y += 14

    # 9. manzil and telefon raqam (+10% size, at bottom)
    m_text = f"manzil: {address}"
    t_text = f"telefon raqam: {phone}"
    m_bb = draw.textbbox((0, 0), m_text, font=f_meta)
    t_bb = draw.textbbox((0, 0), t_text, font=f_meta)
    m_w = m_bb[2] - m_bb[0]
    t_w = t_bb[2] - t_bb[0]

    if margin_x + m_w + 12 > width - margin_x - t_w:
        draw.text((margin_x, y), m_text, fill='black', font=f_meta)
        y += (m_bb[3] - m_bb[1]) + 6
        draw.text((margin_x, y), t_text, fill='black', font=f_meta)
        y += (t_bb[3] - t_bb[1]) + 30
    else:
        draw.text((margin_x, y), m_text, fill='black', font=f_meta)
        draw.text((width - margin_x - t_w, y), t_text, fill='black', font=f_meta)
        y += max(m_bb[3] - m_bb[1], t_bb[3] - t_bb[1]) + 30

    return img.crop((0, 0, width, y))


def format_worker_cheque_text(sale: Sale, setting: Optional[PrinterSetting] = None) -> bytes:
    """
    Text-based fallback format for worker receipt without prices.
    """
    is_58 = (setting and setting.paper_width == '58MM')
    w = 32 if is_58 else 48
    w0, w1, w2 = (3, 20, 5) if is_58 else (4, 33, 7)
    sep = '+' + '-'*w0 + '+' + '-'*w1 + '+' + '-'*w2 + '+'
    double_sep = '=' * w

    def row(c0, c1, c2):
        return '|' + str(c0).center(w0) + '|' + (' ' + str(c1)).ljust(w1)[:w1] + '|' + str(c2).center(w2) + '|'

    buf = bytearray()
    buf.extend(ESC_INIT)

    # 1. Header: AUTO LUX SERVICE
    buf.extend(ESC_ALIGN_CENTER)
    buf.extend(ESC_BOLD_ON)
    buf.extend(ESC_DOUBLE_SIZE)
    buf.extend("AUTO LUX SERVICE\n".encode('utf-8'))
    buf.extend(ESC_NORMAL_SIZE)
    buf.extend(ESC_BOLD_OFF)

    # 2. Double Line
    buf.extend(ESC_ALIGN_LEFT)
    buf.extend(f"{double_sep}\n".encode('utf-8'))

    # 3. Time (left) and Date (right)
    sale_dt = getattr(sale, 'datetime', None) or timezone.now()
    time_str = sale_dt.strftime('%H:%M')
    date_str = sale_dt.strftime('%d.%m.%Y')
    buf.extend(_justify(time_str, date_str, w).encode('utf-8') + b'\n')

    # 4. Mijoz (left) and chek (right)
    client_name = sale.client.name.strip() if (sale.client and sale.client.name) else ""
    client_str = f"Mijoz: {client_name}" if client_name else "Mijoz:"
    chek_str = f"chek: {sale.id}"
    buf.extend(_justify(client_str, chek_str, w).encode('utf-8') + b'\n')

    # 4b. Car info (if available)
    if sale.car:
        car_str = f"Avto: {sale.car.plate_number}"
        if sale.car.car_type:
            car_str += f" ({sale.car.car_type})"
        buf.extend(ESC_BOLD_ON)
        buf.extend(f"{car_str}\n".encode('utf-8'))
        buf.extend(ESC_BOLD_OFF)

    # 5. Table Grid with No | nomi | soni (WITHOUT price!)
    buf.extend(f"{sep}\n".encode('utf-8'))
    buf.extend(ESC_BOLD_ON)
    buf.extend(row('No', 'nomi', 'soni').encode('utf-8') + b'\n')
    buf.extend(ESC_BOLD_OFF)
    buf.extend(f"{sep}\n".encode('utf-8'))

    items = list(sale.items.all().select_related('product', 'product__unit'))
    services = list(sale.services.all().select_related('worker')) if hasattr(sale, 'services') else []
    row_idx = 1

    for item in items:
        p_name = item.product.name if item.product else f"Mahsulot #{item.product_id}"
        qty = float(item.quantity)
        unit_str = item.product.unit.short_name if (item.product and item.product.unit) else "dona"
        qty_str = f"{qty:g} {unit_str}"

        if len(p_name) > w1 - 1:
            part1 = p_name[:w1 - 1]
            part2 = p_name[w1 - 1:2 * (w1 - 1)].strip()
            buf.extend(row(row_idx, part1, qty_str).encode('utf-8') + b'\n')
            if part2:
                buf.extend(row('', part2, '').encode('utf-8') + b'\n')
        else:
            buf.extend(row(row_idx, p_name, qty_str).encode('utf-8') + b'\n')
        buf.extend(f"{sep}\n".encode('utf-8'))
        row_idx += 1

    for svc in services:
        w_tag = f" ({svc.worker.first_name})" if (svc.worker and svc.worker.first_name) else ""
        s_name = f"Xizmat: {svc.service_name}{w_tag}"
        qty_str = "1 xizmat"
        if len(s_name) > w1 - 1:
            part1 = s_name[:w1 - 1]
            part2 = s_name[w1 - 1:2 * (w1 - 1)].strip()
            buf.extend(row(row_idx, part1, qty_str).encode('utf-8') + b'\n')
            if part2:
                buf.extend(row('', part2, '').encode('utf-8') + b'\n')
        else:
            buf.extend(row(row_idx, s_name, qty_str).encode('utf-8') + b'\n')
        buf.extend(f"{sep}\n".encode('utf-8'))
        row_idx += 1

    # 6. Worker checkoff section
    worker_names = [s.worker.get_full_name() or s.worker.username for s in services if s.worker]
    worker_str = ", ".join(sorted(list(set(worker_names)))) if worker_names else "________________________"

    buf.extend(f"{double_sep}\n".encode('utf-8'))
    buf.extend(f"Mas'ul usta: {worker_str}\n".encode('utf-8'))
    buf.extend("Holati:  [  ] Bajarildi   [  ] Jarayonda\n".encode('utf-8'))
    buf.extend(f"{double_sep}\n".encode('utf-8'))

    # 7. manzil and telefon raqam
    manzil_str = "manzil: JIzzax SH. Bunyodkor mahalla mo'ljal: odvanchik"
    tel_str = "telefon raqam: +998970254565"
    buf.extend(_justify(manzil_str, tel_str, w).encode('utf-8') + b'\n')

    buf.extend(ESC_CUT)
    return bytes(buf)


def format_worker_cheque_image(sale: Sale, setting: Optional[PrinterSetting] = None) -> bytes:
    """
    Renders worker ticket as a high-fidelity ESC/POS graphic raster image without prices.
    """
    is_58 = (setting and setting.paper_width == '58MM')
    sale_dt = getattr(sale, 'datetime', None) or timezone.now()
    time_str = sale_dt.strftime('%H:%M')
    date_str = sale_dt.strftime('%d.%m.%Y')
    client_name = sale.client.name.strip() if (sale.client and sale.client.name) else ""

    car_info = ""
    if sale.car:
        car_info = sale.car.plate_number
        if sale.car.car_type:
            car_info += f" ({sale.car.car_type})"

    items_data = []
    for item in sale.items.all().select_related('product', 'product__unit'):
        p_name = item.product.name if item.product else f"Mahsulot #{item.product_id}"
        qty = float(item.quantity)
        unit_str = item.product.unit.short_name if (item.product and item.product.unit) else "dona"
        qty_str = f"{qty:g} {unit_str}"
        items_data.append((p_name, qty_str))

    worker_names = [s.worker.get_full_name() or s.worker.username for s in sale.services.all() if s.worker] if hasattr(sale, 'services') else []
    if worker_names:
        w_tag = f"Usta: {', '.join(sorted(list(set(worker_names))))}"
        car_info = f"{car_info} | {w_tag}" if car_info else w_tag

    for svc in (sale.services.all().select_related('worker') if hasattr(sale, 'services') else []):
        w_tag = f" ({svc.worker.first_name})" if (svc.worker and svc.worker.first_name) else ""
        s_name = f"Xizmat: {svc.service_name}{w_tag}"
        items_data.append((s_name, "1 xizmat"))

    img = render_worker_receipt_image(
        sale_id=sale.id,
        time_str=time_str,
        date_str=date_str,
        client_name=client_name,
        car_info=car_info,
        items=items_data,
        address="JIzzax SH. Bunyodkor mahalla mo'ljal: odvanchik",
        phone="+998970254565",
        is_58=is_58
    )
    return image_to_escpos_raster(img)


def format_worker_cheque(sale: Sale, setting: Optional[PrinterSetting] = None) -> bytes:
    """
    Generates a Worker ticket matching cashier receipt styling but without prices:
    - Primary mode: High-fidelity graphical raster print
    - Fallback mode: ESC/POS text mode
    """
    if setting and setting.command_type == 'RAW_TEXT':
        return format_worker_cheque_text(sale, setting)

    if HAS_PIL:
        try:
            return format_worker_cheque_image(sale, setting)
        except Exception as e:
            logger.warning(f"Error rendering raster worker receipt, falling back to text: {e}")
            return format_worker_cheque_text(sale, setting)

    return format_worker_cheque_text(sale, setting)


# ==========================================
# UNIVERSAL BARCODE ENCODERS (EAN-13, EAN-8, CODE 128)
# ==========================================
CODE128_PATTERNS = [
    "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
    "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
    "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
    "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
    "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
    "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
    "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
    "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
    "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
    "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
    "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
    "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
    "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
    "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
    "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
    "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
    "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
    "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
    "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
    "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
    "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
    "11010011100", "1100011101011",
]

EAN_L_CODES = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
EAN_G_CODES = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
EAN_R_CODES = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']

EAN13_PARITY = [
    'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
    'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'
]


def encode_ean13(code: str) -> Optional[Tuple[str, List[Tuple[str, bool]]]]:
    """
    Encodes numeric 12- or 13-digit code into standard EAN-13 modules.
    Returns (full_13_digits, [(bit, is_guard), ...]). Total modules: 95.
    """
    digits = ''.join(c for c in str(code).strip() if c.isdigit())
    if len(digits) == 12:
        s = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits))
        digits += str((10 - (s % 10)) % 10)
    elif len(digits) == 13:
        s = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits[:12]))
        chk = (10 - (s % 10)) % 10
        if int(digits[12]) != chk:
            digits = digits[:12] + str(chk)
    else:
        return None

    first = int(digits[0])
    parity_pattern = EAN13_PARITY[first]

    modules: List[Tuple[str, bool]] = []
    # Start guard: 101
    for b in '101':
        modules.append((b, True))

    for digit_char, p in zip(digits[1:7], parity_pattern):
        d = int(digit_char)
        pat = EAN_L_CODES[d] if p == 'L' else EAN_G_CODES[d]
        for b in pat:
            modules.append((b, False))

    # Center guard: 01010
    for b in '01010':
        modules.append((b, True))

    for digit_char in digits[7:13]:
        d = int(digit_char)
        pat = EAN_R_CODES[d]
        for b in pat:
            modules.append((b, False))

    # End guard: 101
    for b in '101':
        modules.append((b, True))

    return digits, modules


def encode_ean8(code: str) -> Optional[Tuple[str, List[Tuple[str, bool]]]]:
    """
    Encodes numeric 7- or 8-digit code into standard EAN-8 modules.
    Returns (full_8_digits, [(bit, is_guard), ...]). Total modules: 67.
    """
    digits = ''.join(c for c in str(code).strip() if c.isdigit())
    if len(digits) == 7:
        s = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(digits))
        digits += str((10 - (s % 10)) % 10)
    elif len(digits) == 8:
        s = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(digits[:7]))
        chk = (10 - (s % 10)) % 10
        if int(digits[7]) != chk:
            digits = digits[:7] + str(chk)
    else:
        return None

    modules: List[Tuple[str, bool]] = []
    for b in '101':
        modules.append((b, True))
    for d in digits[:4]:
        for b in EAN_L_CODES[int(d)]:
            modules.append((b, False))
    for b in '01010':
        modules.append((b, True))
    for d in digits[4:]:
        for b in EAN_R_CODES[int(d)]:
            modules.append((b, False))
    for b in '101':
        modules.append((b, True))

    return digits, modules


def encode_code128_b(text: str) -> str:
    """Encodes ASCII text into standard Code 128 Subset B binary pattern."""
    clean_text = "".join(c for c in str(text) if 32 <= ord(c) <= 126) or "00000000"
    vals = [ord(c) - 32 for c in clean_text]
    checksum = (104 + sum(v * i for i, v in enumerate(vals, 1))) % 103
    pattern_indices = [104] + vals + [checksum, 106]
    return "".join(CODE128_PATTERNS[idx] for idx in pattern_indices)


def render_barcode_label_image(product: Product, setting: Optional[PrinterSetting] = None, barcode_val: Optional[str] = None) -> Image.Image:
    """
    Renders a pixel-perfect barcode label at 203 DPI (8 dots/mm):
    - Uses EAN-13 for 12/13-digit numbers (matching retail standard and Easy Trade)
    - Uses EAN-8 for 7/8-digit numbers
    - Uses Code 128 for alphanumeric codes with generous quiet zones
    - Guard bars extend lower than data bars
    - Human-readable numbers positioned in standard format
    - NO price (per user requirements)
    """
    lbl_w = setting.label_width if (setting and setting.label_width) else 50
    lbl_h = setting.label_height if (setting and setting.label_height) else 30
    w_px = max(240, int(lbl_w * 8))
    h_px = max(160, int(lbl_h * 8))

    img = Image.new('RGB', (w_px, h_px), 'white')
    draw = ImageDraw.Draw(img)

    f_title = _get_font(int(20 * (h_px / 240)), bold=True)
    f_num = _get_font(int(18 * (h_px / 240)), bold=True)

    # 1. Product title
    product_name = product.name[:35] if product.name else "Mahsulot"
    bb_title = draw.textbbox((0, 0), product_name, font=f_title)
    tw = bb_title[2] - bb_title[0]
    draw.text((max(10, (w_px - tw) // 2), 8), product_name, fill='black', font=f_title)

    # 2. Barcode resolution
    if not barcode_val:
        raw = str(product.barcode if product.barcode else str(product.id).zfill(8)).strip()
        barcode_val = raw.split(',')[0].strip()
    else:
        barcode_val = str(barcode_val).strip()

    ean13_res = encode_ean13(barcode_val)
    ean8_res = encode_ean8(barcode_val) if not ean13_res else None

    if ean13_res:
        digits, modules = ean13_res
        bar_w = 3 if (len(modules) * 3 <= w_px - 40) else 2
        bc_w = len(modules) * bar_w
        start_x = (w_px - bc_w) // 2
        bc_y = int(44 * (h_px / 240))
        data_h = int(100 * (h_px / 240))
        guard_h = int(114 * (h_px / 240))

        x = start_x
        for bit, is_guard in modules:
            h = guard_h if is_guard else data_h
            if bit == '1':
                draw.rectangle([(x, bc_y), (x + bar_w - 1, bc_y + h)], fill='black')
            x += bar_w

        # Draw EAN-13 numbers exactly like retail stickers:
        # Digit 0 on left outside guard:
        d0 = digits[0]
        bb0 = draw.textbbox((0, 0), d0, font=f_num)
        draw.text((start_x - 14 - (bb0[2] - bb0[0]) // 2, bc_y + data_h + 2), d0, fill='black', font=f_num)

        # Left 6 digits centered between start guard and center guard:
        left_center_x = start_x + int((3 + 21) * bar_w)
        d_left = " ".join(list(digits[1:7]))
        bb_l = draw.textbbox((0, 0), d_left, font=f_num)
        draw.text((left_center_x - (bb_l[2] - bb_l[0]) // 2, bc_y + data_h + 2), d_left, fill='black', font=f_num)

        # Right 6 digits centered between center guard and end guard:
        right_center_x = start_x + int((3 + 42 + 5 + 21) * bar_w)
        d_right = " ".join(list(digits[7:13]))
        bb_r = draw.textbbox((0, 0), d_right, font=f_num)
        draw.text((right_center_x - (bb_r[2] - bb_r[0]) // 2, bc_y + data_h + 2), d_right, fill='black', font=f_num)

    elif ean8_res:
        digits, modules = ean8_res
        bar_w = 4 if (len(modules) * 4 <= w_px - 40) else 3
        bc_w = len(modules) * bar_w
        start_x = (w_px - bc_w) // 2
        bc_y = int(44 * (h_px / 240))
        data_h = int(100 * (h_px / 240))
        guard_h = int(114 * (h_px / 240))

        x = start_x
        for bit, is_guard in modules:
            h = guard_h if is_guard else data_h
            if bit == '1':
                draw.rectangle([(x, bc_y), (x + bar_w - 1, bc_y + h)], fill='black')
            x += bar_w

        # Left 4 digits:
        left_center_x = start_x + int((3 + 14) * bar_w)
        d_left = " ".join(list(digits[:4]))
        bb_l = draw.textbbox((0, 0), d_left, font=f_num)
        draw.text((left_center_x - (bb_l[2] - bb_l[0]) // 2, bc_y + data_h + 2), d_left, fill='black', font=f_num)

        # Right 4 digits:
        right_center_x = start_x + int((3 + 28 + 5 + 14) * bar_w)
        d_right = " ".join(list(digits[4:]))
        bb_r = draw.textbbox((0, 0), d_right, font=f_num)
        draw.text((right_center_x - (bb_r[2] - bb_r[0]) // 2, bc_y + data_h + 2), d_right, fill='black', font=f_num)

    else:
        # Code 128 for alphanumeric with generous quiet zones
        pattern = encode_code128_b(barcode_val)
        bar_w = 2 if (len(pattern) * 2 <= (w_px - 40)) else 1
        bc_w = len(pattern) * bar_w
        start_x = max(20, (w_px - bc_w) // 2)
        bc_y = int(46 * (h_px / 240))
        bc_h = int(100 * (h_px / 240))

        x = start_x
        for bit in pattern:
            if bit == '1':
                draw.rectangle([(x, bc_y), (x + bar_w - 1, bc_y + bc_h)], fill='black')
            x += bar_w

        bb_code = draw.textbbox((0, 0), barcode_val, font=f_num)
        cw = bb_code[2] - bb_code[0]
        draw.text((max(10, (w_px - cw) // 2), bc_y + bc_h + 8), barcode_val, fill='black', font=f_num)

    return img


def render_barcode_label_svg(product: Product, setting: Optional[PrinterSetting] = None, barcode_val: Optional[str] = None) -> str:
    """
    Renders pure vector SVG barcode label (50mm x 30mm standard):
    - Auto EAN-13 / EAN-8 for retail numeric barcodes (scans on 100% of handheld scanners)
    - Auto Code 128 for alphanumeric/artikul codes with generous quiet zones
    - shape-rendering="crispEdges" for pure razor-sharp printing
    - NO price (per user requirements)
    """
    lbl_w = setting.label_width if (setting and setting.label_width) else 50
    lbl_h = setting.label_height if (setting and setting.label_height) else 30
    
    vw = int(lbl_w * 8)
    vh = int(lbl_h * 8)

    product_name = product.name[:35] if product.name else "Mahsulot"
    clean_name = html.escape(product_name.strip())

    if not barcode_val:
        raw = str(product.barcode if product.barcode else str(product.id).zfill(8)).strip()
        barcode_val = raw.split(',')[0].strip()
    else:
        barcode_val = str(barcode_val).strip()

    clean_bc = html.escape(barcode_val)
    ean13_res = encode_ean13(barcode_val)
    ean8_res = encode_ean8(barcode_val) if not ean13_res else None

    if ean13_res:
        digits, modules = ean13_res
        bar_w = 3 if (len(modules) * 3 <= vw - 40) else 2
        bc_w = len(modules) * bar_w
        start_x = (vw - bc_w) // 2
        bc_y = int(44 * (vh / 240))
        data_h = int(100 * (vh / 240))
        guard_h = int(114 * (vh / 240))

        rects = []
        i = 0
        x = start_x
        while i < len(modules):
            bit, is_guard = modules[i]
            h = guard_h if is_guard else data_h
            if bit == '1':
                start_i = i
                while i < len(modules) and modules[i][0] == '1' and modules[i][1] == is_guard:
                    i += 1
                run_len = i - start_i
                w = run_len * bar_w
                rects.append(f'<rect x="{x}" y="{bc_y}" width="{w}" height="{h}" fill="#000000" />')
                x += w
            else:
                start_i = i
                while i < len(modules) and modules[i][0] == '0':
                    i += 1
                x += (i - start_i) * bar_w

        rects_svg = "\n    ".join(rects)
        left_center_x = start_x + int((3 + 21) * bar_w)
        right_center_x = start_x + int((3 + 42 + 5 + 21) * bar_w)
        text_y = bc_y + data_h + 16

        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" width="{lbl_w}mm" height="{lbl_h}mm" style="background:#ffffff;shape-rendering:crispEdges;display:block;margin:0 auto;">
  <style>
    .lbl-title {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 19px; font-weight: bold; text-anchor: middle; fill: #000000; }}
    .lbl-digit-lead {{ font-family: "Consolas", "Courier New", monospace, Arial; font-size: 18px; font-weight: bold; text-anchor: middle; fill: #000000; }}
    .lbl-digits {{ font-family: "Consolas", "Courier New", monospace, Arial; font-size: 18px; font-weight: bold; text-anchor: middle; letter-spacing: 1.5px; fill: #000000; }}
  </style>
  <text x="{vw // 2}" y="28" class="lbl-title">{clean_name}</text>
  <g>
    {rects_svg}
  </g>
  <text x="{start_x - 14}" y="{text_y}" class="lbl-digit-lead">{digits[0]}</text>
  <text x="{left_center_x}" y="{text_y}" class="lbl-digits">{digits[1:7]}</text>
  <text x="{right_center_x}" y="{text_y}" class="lbl-digits">{digits[7:13]}</text>
</svg>"""
        return svg

    elif ean8_res:
        digits, modules = ean8_res
        bar_w = 4 if (len(modules) * 4 <= vw - 40) else 3
        bc_w = len(modules) * bar_w
        start_x = (vw - bc_w) // 2
        bc_y = int(44 * (vh / 240))
        data_h = int(100 * (vh / 240))
        guard_h = int(114 * (vh / 240))

        rects = []
        i = 0
        x = start_x
        while i < len(modules):
            bit, is_guard = modules[i]
            h = guard_h if is_guard else data_h
            if bit == '1':
                start_i = i
                while i < len(modules) and modules[i][0] == '1' and modules[i][1] == is_guard:
                    i += 1
                run_len = i - start_i
                w = run_len * bar_w
                rects.append(f'<rect x="{x}" y="{bc_y}" width="{w}" height="{h}" fill="#000000" />')
                x += w
            else:
                start_i = i
                while i < len(modules) and modules[i][0] == '0':
                    i += 1
                x += (i - start_i) * bar_w

        rects_svg = "\n    ".join(rects)
        left_center_x = start_x + int((3 + 14) * bar_w)
        right_center_x = start_x + int((3 + 28 + 5 + 14) * bar_w)
        text_y = bc_y + data_h + 16

        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" width="{lbl_w}mm" height="{lbl_h}mm" style="background:#ffffff;shape-rendering:crispEdges;display:block;margin:0 auto;">
  <style>
    .lbl-title {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 19px; font-weight: bold; text-anchor: middle; fill: #000000; }}
    .lbl-digits {{ font-family: "Consolas", "Courier New", monospace, Arial; font-size: 18px; font-weight: bold; text-anchor: middle; letter-spacing: 2px; fill: #000000; }}
  </style>
  <text x="{vw // 2}" y="28" class="lbl-title">{clean_name}</text>
  <g>
    {rects_svg}
  </g>
  <text x="{left_center_x}" y="{text_y}" class="lbl-digits">{digits[:4]}</text>
  <text x="{right_center_x}" y="{text_y}" class="lbl-digits">{digits[4:]}</text>
</svg>"""
        return svg

    else:
        # Code 128 for alphanumeric
        pattern = encode_code128_b(barcode_val)
        bar_w = 2 if (len(pattern) * 2 <= (vw - 40)) else 1
        bc_w = len(pattern) * bar_w
        start_x = max(20, (vw - bc_w) // 2)
        bc_y = int(46 * (vh / 240))
        bc_h = int(112 * (vh / 240))

        rects = []
        i = 0
        x = start_x
        while i < len(pattern):
            if pattern[i] == '1':
                start_i = i
                while i < len(pattern) and pattern[i] == '1':
                    i += 1
                run_len = i - start_i
                w = run_len * bar_w
                rects.append(f'<rect x="{x}" y="{bc_y}" width="{w}" height="{bc_h}" fill="#000000" />')
                x += w
            else:
                start_i = i
                while i < len(pattern) and pattern[i] == '0':
                    i += 1
                x += (i - start_i) * bar_w

        rects_svg = "\n    ".join(rects)
        text_y = bc_y + bc_h + 22

        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" width="{lbl_w}mm" height="{lbl_h}mm" style="background:#ffffff;shape-rendering:crispEdges;display:block;margin:0 auto;">
  <style>
    .lbl-title {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 19px; font-weight: bold; text-anchor: middle; fill: #000000; }}
    .lbl-code {{ font-family: "Consolas", "Courier New", monospace, Arial; font-size: 20px; font-weight: bold; text-anchor: middle; fill: #000000; }}
  </style>
  <text x="{vw // 2}" y="28" class="lbl-title">{clean_name}</text>
  <g>
    {rects_svg}
  </g>
  <text x="{vw // 2}" y="{text_y}" class="lbl-code">{clean_bc}</text>
</svg>"""
        return svg


def format_barcode_labels(product: Product, quantity: int = 1, setting: Optional[PrinterSetting] = None, barcode_val: Optional[str] = None) -> bytes:
    """
    Generates thermal barcode label print commands without price.
    Uses hardware EAN-13 / EAN-8 for numeric barcodes, and Code 128 for others.
    """
    quantity = max(1, int(quantity))
    cmd_type = setting.command_type if setting else 'TSPL'
    lbl_w = setting.label_width if setting else 50
    lbl_h = setting.label_height if setting else 30

    product_name = product.name[:30] if product.name else "Mahsulot"
    if not barcode_val:
        raw = str(product.barcode if product.barcode else str(product.id).zfill(8)).strip()
        barcode_val = raw.split(',')[0].strip()
    else:
        barcode_val = str(barcode_val).strip()

    ean13_res = encode_ean13(barcode_val)
    ean8_res = encode_ean8(barcode_val) if not ean13_res else None

    if cmd_type == 'TSPL':
        w_dots = int(lbl_w * 8)
        h_dots = int(lbl_h * 8)

        clean_name = product_name.replace('"', '').replace("'", "").strip()
        chars_per_line = max(10, (w_dots - 20) // 12)
        if len(clean_name) > chars_per_line:
            line1 = clean_name[:chars_per_line]
            line2 = clean_name[chars_per_line:chars_per_line * 2]
        else:
            line1 = clean_name
            line2 = ""

        name1_x = max(10, (w_dots - (len(line1) * 12)) // 2)
        name1_y = 12

        name2_lines = ""
        curr_y = name1_y + 22
        if line2:
            name2_x = max(10, (w_dots - (len(line2) * 12)) // 2)
            name2_lines = f'TEXT {name2_x}, {curr_y}, "2", 0, 1, 1, "{line2}"\r\n'
            curr_y += 22

        bc_y = curr_y + 8
        bc_h = max(50, min(95, h_dots - curr_y - 45))

        if ean13_res:
            digits, _ = ean13_res
            bc_w = 95 * 3
            bc_x = max(10, (w_dots - bc_w) // 2)
            bc_cmd = f'BARCODE {bc_x}, {bc_y}, "EAN13", {bc_h}, 1, 0, 3, 3, "{digits}"\r\n'
        elif ean8_res:
            digits, _ = ean8_res
            bc_w = 67 * 4
            bc_x = max(10, (w_dots - bc_w) // 2)
            bc_cmd = f'BARCODE {bc_x}, {bc_y}, "EAN8", {bc_h}, 1, 0, 4, 4, "{digits}"\r\n'
        else:
            clean_barcode = str(barcode_val).replace('"', '').strip()
            narrow = 2
            est_bc_w = (len(clean_barcode) + 3) * 11 * narrow + 30
            if est_bc_w > (w_dots - 20):
                narrow = 1
            wide = narrow
            bc_w = (len(clean_barcode) + 3) * 11 * narrow
            bc_x = max(10, (w_dots - bc_w) // 2)
            bc_cmd = f'BARCODE {bc_x}, {bc_y}, "128", {bc_h}, 1, 0, {narrow}, {wide}, "{clean_barcode}"\r\n'

        tspl = (
            f"SIZE {lbl_w} mm, {lbl_h} mm\r\n"
            f"GAP 2 mm, 0 mm\r\n"
            f"SPEED 3\r\n"
            f"DENSITY 12\r\n"
            f"DIRECTION 0\r\n"
            f"REFERENCE 0, 0\r\n"
            f"SET RIBBON OFF\r\n"
            f"SET PEEL OFF\r\n"
            f"CLS\r\n"
            f"TEXT {name1_x}, {name1_y}, \"2\", 0, 1, 1, \"{line1}\"\r\n"
            f"{name2_lines}"
            f"{bc_cmd}"
            f"PRINT {quantity}, 1\r\n"
        )
        return tspl.encode('utf-8')

    elif cmd_type == 'ESCPOS':
        buf = bytearray()
        for _ in range(quantity):
            buf.extend(ESC_INIT)
            buf.extend(ESC_ALIGN_CENTER)
            buf.extend(ESC_BOLD_ON)
            buf.extend(f"{product_name}\n".encode('utf-8'))
            buf.extend(ESC_BOLD_OFF)
            buf.extend(b'\x1dh\x50')  # Height: 80 dots
            buf.extend(b'\x1dH\x02')  # HRI font: below barcode

            if ean13_res:
                digits, _ = ean13_res
                buf.extend(b'\x1dw\x03')  # Width: 3
                buf.extend(b'\x1dk\x02' + digits.encode('ascii') + b'\x00')
            elif ean8_res:
                digits, _ = ean8_res
                buf.extend(b'\x1dw\x03')  # Width: 3
                buf.extend(b'\x1dk\x03' + digits.encode('ascii') + b'\x00')
            else:
                clean_barcode = str(barcode_val).strip()
                barcode_bytes = b'{B' + clean_barcode.encode('ascii', errors='ignore')
                buf.extend(b'\x1dw\x02')  # Width: 2
                buf.extend(b'\x1dk\x49' + bytes([len(barcode_bytes)]) + barcode_bytes)

            buf.extend(b'\n\n\x1d\x56\x41\x05')  # Cut / feed
        return bytes(buf)

    else:
        buf = bytearray()
        for i in range(1, quantity + 1):
            text_label = (
                f"{'='*30}\n"
                f"Mahsulot: {product_name}\n"
                f"Chiziqli belgi: {barcode_val}\n"
                f"[Etiketka {i}/{quantity}]\n"
                f"{'='*30}\n\n"
            )
            buf.extend(text_label.encode('utf-8'))
        return bytes(buf)


# ==========================================
# HIGH-LEVEL PRINT DISPATCHERS
# ==========================================
def print_sale_tickets(sale: Sale, target: str = 'both') -> dict:
    """
    Prints cashier cheque, worker cheque, or both for a given sale.
    target: 'both' | 'cashier' | 'worker'
    """
    results = {}
    cashier_setting = PrinterSetting.objects.filter(printer_type='CASHIER_CHEQUE').first()
    worker_setting = PrinterSetting.objects.filter(printer_type='WORKER_CHEQUE').first()

    # 1. Cashier Cheque (with prices)
    if target in ('both', 'cashier'):
        if cashier_setting and cashier_setting.is_enabled and cashier_setting.connection_type != 'DISABLED':
            cashier_bytes = format_cashier_cheque(sale, cashier_setting)
            ok, msg = send_raw_to_printer(cashier_setting, cashier_bytes, f"Cheque_{sale.id}_Cashier")
            results['cashier'] = {'success': ok, 'message': msg}
        else:
            results['cashier'] = {'success': True, 'message': "Kassir printeri o'chirilgan yoki sozlanmagan"}

    # 2. Worker Cheque (without prices)
    if target in ('both', 'worker'):
        if worker_setting and worker_setting.is_enabled and worker_setting.connection_type != 'DISABLED':
            worker_bytes = format_worker_cheque(sale, worker_setting)
            ok, msg = send_raw_to_printer(worker_setting, worker_bytes, f"Cheque_{sale.id}_Worker")
            results['worker'] = {'success': ok, 'message': msg}
        else:
            results['worker'] = {'success': True, 'message': "Ishchi printeri o'chirilgan yoki sozlanmagan"}

    return results


def print_product_barcode(product_id: int, quantity: int = 1, barcode_val: Optional[str] = None) -> Tuple[bool, str]:
    """
    Prints barcode labels for a product directly to the configured barcode printer.
    Quantity is dynamic and NOT hardcoded.
    Routes through Windows GDI when connection_type == 'WINDOWS' for 100% Seagull/manufacturer driver compatibility.
    """
    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        return False, f"Mahsulot topilmadi (ID: {product_id})"

    barcode_setting = PrinterSetting.objects.filter(printer_type='BARCODE').first()
    if not barcode_setting or not barcode_setting.is_enabled or barcode_setting.connection_type == 'DISABLED':
        return False, "Chiziqli belgi (Barcode) printeri o'chirilgan yoki sozlanmagan. Sozlamalardan yoqing."

    quantity = max(1, int(quantity))

    # Resolve barcode_val
    if not barcode_val:
        raw = str(product.barcode if product.barcode else str(product.id).zfill(8)).strip()
        barcode_val = raw.split(',')[0].strip()
    else:
        barcode_val = str(barcode_val).strip()

    # For Windows printer connection, route through GDI graphics pipeline
    if barcode_setting.connection_type == 'WINDOWS':
        if not barcode_setting.printer_name:
            return False, "Windows printeri tanlanmagan. Sozlamalardan printerni tanlang."
        if HAS_PIL:
            try:
                img = render_barcode_label_image(product, setting=barcode_setting, barcode_val=barcode_val)
                return print_image_to_windows_gdi(
                    barcode_setting.printer_name,
                    f"Barcode_{product.id}",
                    img,
                    quantity=quantity,
                    label_width=barcode_setting.label_width,
                    label_height=barcode_setting.label_height
                )
            except Exception as e:
                logger.warning(f"Barcode GDI render failed, falling back to spooler: {e}")

    raw_data = format_barcode_labels(product, quantity=quantity, setting=barcode_setting, barcode_val=barcode_val)
    return send_raw_to_printer(barcode_setting, raw_data, f"Barcode_{product.id}_qty{quantity}")


def get_barcode_label_b64(product_id: int, barcode_val: Optional[str] = None) -> Optional[str]:
    """
    Renders pixel-perfect barcode label image and returns data URL (base64)
    for preview and Windows/Browser direct printing.
    """
    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        return None

    barcode_setting = PrinterSetting.objects.filter(printer_type='BARCODE').first()
    img = render_barcode_label_image(product, setting=barcode_setting, barcode_val=barcode_val)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode('ascii')


def get_barcode_label_svg(product_id: int, barcode_val: Optional[str] = None) -> Optional[str]:
    """
    Returns the pure vector SVG string for direct razor-sharp browser and Windows printing.
    Zero raster dithering/antialiasing blur, 100% crisp solid black bars, and NO price.
    """
    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        return None

    barcode_setting = PrinterSetting.objects.filter(printer_type='BARCODE').first()
    return render_barcode_label_svg(product, setting=barcode_setting, barcode_val=barcode_val)


def execute_test_print(printer_type: str) -> Tuple[bool, str]:
    """
    Sends a test print job to verify connectivity for the given printer type.
    """
    setting = PrinterSetting.objects.filter(printer_type=printer_type).first()
    if not setting:
        return False, f"'{printer_type}' sozlamasi topilmadi"

    if setting.connection_type == 'DISABLED':
        return False, "Printer o'chirilgan holatda. Avval ulanish turini tanlang."

    if printer_type == 'CASHIER_CHEQUE':
        is_58 = (setting and setting.paper_width == '58MM')
        if setting and setting.command_type != 'RAW_TEXT' and HAS_PIL:
            try:
                img = render_cashier_receipt_image(
                    sale_id=123,
                    time_str="12:12",
                    date_str="12.12.2000",
                    client_name="",
                    items=[
                        ("nomi", "1", 10000, 10000),
                        ("nomi", "2", 10000, 20000),
                        ("nomi", "1", 10000, 10000)
                    ],
                    total_amount=40000,
                    discount=0,
                    address="JIzzax SH. Bunyodkor mahalla mo'ljal: odvanchik",
                    phone="+998970254565",
                    is_58=is_58
                )
                raster_bytes = image_to_escpos_raster(img)
                return send_raw_to_printer(setting, raster_bytes, "Test_Cashier_Cheque")
            except Exception as e:
                logger.warning(f"Test print raster generation failed: {e}")

        # Text mode fallback
        w = 32 if is_58 else 48
        if is_58:
            w0, w1, w2, w3, w4 = (2, 8, 3, 6, 6)
        else:
            w0, w1, w2, w3, w4 = (3, 16, 5, 9, 9)

        sep = '+' + '-'*w0 + '+' + '-'*w1 + '+' + '-'*w2 + '+' + '-'*w3 + '+' + '-'*w4 + '+'
        double_sep = '=' * w

        def row(c0, c1, c2, c3, c4):
            return (
                '|' + str(c0).center(w0) +
                '|' + (' ' + str(c1)).ljust(w1)[:w1] +
                '|' + str(c2).center(w2) +
                '|' + (str(c3) + ' ').rjust(w3)[:w3] +
                '|' + (str(c4) + ' ').rjust(w4)[:w4] +
                '|'
            )

        buf = bytearray()
        buf.extend(ESC_INIT)
        buf.extend(ESC_ALIGN_CENTER)
        buf.extend(ESC_BOLD_ON)
        buf.extend(ESC_DOUBLE_SIZE)
        buf.extend("AUTO LUX SERVICE\n".encode('utf-8'))
        buf.extend(ESC_NORMAL_SIZE)
        buf.extend(ESC_BOLD_OFF)
        buf.extend(ESC_ALIGN_LEFT)
        buf.extend(f"{double_sep}\n".encode('utf-8'))
        buf.extend(_justify("12:12", "12.12.2000", w).encode('utf-8') + b'\n')
        buf.extend(_justify("Mijoz:", "chek: 123", w).encode('utf-8') + b'\n')
        buf.extend(f"{sep}\n".encode('utf-8'))
        buf.extend(ESC_BOLD_ON)
        buf.extend(row('No', 'nomi', 'soni', 'narxi', 'jami').encode('utf-8') + b'\n')
        buf.extend(ESC_BOLD_OFF)
        buf.extend(f"{sep}\n".encode('utf-8'))
        buf.extend(row(1, 'nomi', '1', '10,000', '10,000').encode('utf-8') + b'\n')
        buf.extend(f"{sep}\n".encode('utf-8'))
        buf.extend(row(2, 'nomi', '2', '10,000', '20,000').encode('utf-8') + b'\n')
        buf.extend(f"{sep}\n".encode('utf-8'))
        buf.extend(row(3, 'nomi', '1', '10,000', '10,000').encode('utf-8') + b'\n')
        buf.extend(f"{sep}\n".encode('utf-8'))
        buf.extend(ESC_BOLD_ON)
        buf.extend(_justify("Jami: 40,000", "Chegirma: 0", w).encode('utf-8') + b'\n')
        buf.extend(ESC_BOLD_OFF)
        buf.extend(f"{double_sep}\n".encode('utf-8'))
        buf.extend(ESC_ALIGN_CENTER)
        buf.extend("xaridingiz uchun rahmat\n".encode('utf-8'))
        buf.extend(ESC_ALIGN_LEFT)
        buf.extend(_justify("manzil: JIzzax SH. Bunyodkor mahalla mo'ljal: odvanchik", "telefon raqam: +998970254565", w).encode('utf-8') + b'\n')
        buf.extend(ESC_CUT)
        return send_raw_to_printer(setting, bytes(buf), "Test_Cashier_Cheque")

    elif printer_type == 'WORKER_CHEQUE':
        is_58 = (setting and setting.paper_width == '58MM')
        if setting and setting.command_type != 'RAW_TEXT' and HAS_PIL:
            try:
                img = render_worker_receipt_image(
                    sale_id=123,
                    time_str="12:12",
                    date_str="12.12.2000",
                    client_name="",
                    car_info="01 A 777 AA (Chevrolet Gentra)",
                    items=[
                        ("nomi", "1"),
                        ("nomi", "2"),
                        ("nomi", "1")
                    ],
                    address="JIzzax SH. Bunyodkor mahalla mo'ljal: odvanchik",
                    phone="+998970254565",
                    is_58=is_58
                )
                raster_bytes = image_to_escpos_raster(img)
                return send_raw_to_printer(setting, raster_bytes, "Test_Worker_Cheque")
            except Exception as e:
                logger.warning(f"Test print raster worker receipt failed: {e}")

        # Text mode fallback
        w = 32 if is_58 else 48
        w0, w1, w2 = (3, 20, 5) if is_58 else (4, 33, 7)
        sep = '+' + '-'*w0 + '+' + '-'*w1 + '+' + '-'*w2 + '+'
        double_sep = '=' * w

        def row(c0, c1, c2):
            return '|' + str(c0).center(w0) + '|' + (' ' + str(c1)).ljust(w1)[:w1] + '|' + str(c2).center(w2) + '|'

        buf = bytearray()
        buf.extend(ESC_INIT)
        buf.extend(ESC_ALIGN_CENTER)
        buf.extend(ESC_BOLD_ON)
        buf.extend(ESC_DOUBLE_SIZE)
        buf.extend("AUTO LUX SERVICE\n".encode('utf-8'))
        buf.extend(ESC_NORMAL_SIZE)
        buf.extend(ESC_BOLD_OFF)
        buf.extend(ESC_ALIGN_LEFT)
        buf.extend(f"{double_sep}\n".encode('utf-8'))
        buf.extend(_justify("12:12", "12.12.2000", w).encode('utf-8') + b'\n')
        buf.extend(_justify("Mijoz:", "chek: 123", w).encode('utf-8') + b'\n')
        buf.extend(ESC_BOLD_ON)
        buf.extend("Avto: 01 A 777 AA (Chevrolet Gentra)\n".encode('utf-8'))
        buf.extend(ESC_BOLD_OFF)
        buf.extend(f"{sep}\n".encode('utf-8'))
        buf.extend(ESC_BOLD_ON)
        buf.extend(row('No', 'nomi', 'soni').encode('utf-8') + b'\n')
        buf.extend(ESC_BOLD_OFF)
        buf.extend(f"{sep}\n".encode('utf-8'))
        buf.extend(row(1, 'nomi', '1').encode('utf-8') + b'\n')
        buf.extend(f"{sep}\n".encode('utf-8'))
        buf.extend(row(2, 'nomi', '2').encode('utf-8') + b'\n')
        buf.extend(f"{sep}\n".encode('utf-8'))
        buf.extend(row(3, 'nomi', '1').encode('utf-8') + b'\n')
        buf.extend(f"{sep}\n".encode('utf-8'))
        buf.extend(f"{double_sep}\n".encode('utf-8'))
        buf.extend("Mas'ul usta: ________________________\n".encode('utf-8'))
        buf.extend("Holati:  [  ] Bajarildi   [  ] Jarayonda\n".encode('utf-8'))
        buf.extend(f"{double_sep}\n".encode('utf-8'))
        buf.extend(_justify("manzil: JIzzax SH. Bunyodkor mahalla mo'ljal: odvanchik", "telefon raqam: +998970254565", w).encode('utf-8') + b'\n')
        buf.extend(ESC_CUT)
        return send_raw_to_printer(setting, bytes(buf), "Test_Worker_Cheque")

    elif printer_type == 'BARCODE':
        # Test barcode label
        test_product = Product(
            name="Test Mahsulot (50x30)",
            barcode="10001234",
            selling_price=45000.00
        )
        if setting.connection_type == 'WINDOWS':
            if not setting.printer_name:
                return False, "Windows printeri tanlanmagan. Sozlamalardan printerni tanlang."
            if HAS_PIL:
                try:
                    img = render_barcode_label_image(test_product, setting=setting)
                    return print_image_to_windows_gdi(
                        setting.printer_name,
                        "Test_Barcode_Label",
                        img,
                        quantity=1,
                        label_width=setting.label_width,
                        label_height=setting.label_height
                    )
                except Exception as e:
                    logger.warning(f"Test barcode GDI print failed, falling back to spooler: {e}")

        test_data = format_barcode_labels(test_product, quantity=1, setting=setting)
        return send_raw_to_printer(setting, test_data, "Test_Barcode_Label")

    return False, f"Noma'lum printer turi: {printer_type}"
