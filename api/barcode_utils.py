import re
import time
from typing import Optional


def calculate_ean13_checksum(digits12: str) -> str:
    """
    Computes standard GS1 EAN-13 check digit for the first 12 numeric digits.
    Weights: 1 for odd positions (0-indexed: 0, 2, 4, 6, 8, 10),
             3 for even positions (0-indexed: 1, 3, 5, 7, 9, 11).
    """
    clean = re.sub(r'\D', '', str(digits12))[:12]
    if len(clean) < 12:
        clean = clean.zfill(12)
    s = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(clean))
    return str((10 - (s % 10)) % 10)


def is_valid_ean13(code: str) -> bool:
    """
    Validates whether a string is a 13-digit EAN-13 barcode with a correct check digit.
    """
    clean = re.sub(r'\D', '', str(code).strip())
    if len(clean) != 13:
        return False
    return calculate_ean13_checksum(clean[:12]) == clean[12]


def generate_unique_ean13(prefix: str = "200") -> str:
    """
    Generates a unique 13-digit EAN-13 barcode.
    Uses GS1 internal prefix (default '200') + 9-digit base + check digit.
    Checks api_product table to ensure uniqueness across existing products.
    """
    from .models import Product

    clean_prefix = re.sub(r'\D', '', str(prefix)) or '200'
    # Base needs to be 12 digits total (clean_prefix + remainder)
    pad_len = 12 - len(clean_prefix)
    start_base = int(f"{clean_prefix}{'0' * (pad_len - 1)}1")
    max_base = 0

    try:
        existing_bcs = Product.objects.filter(barcode__startswith=clean_prefix).values_list('barcode', flat=True)
        for b in existing_bcs:
            for part in str(b).split(','):
                digits = re.sub(r'\D', '', part)
                if len(digits) == 13 and digits.startswith(clean_prefix):
                    try:
                        val = int(digits[:12])
                        if val > max_base:
                            max_base = val
                    except ValueError:
                        pass
    except Exception:
        pass

    next_base = max(start_base, max_base + 1) if max_base > 0 else start_base

    # Ensure no collision with any product
    for _ in range(5000):
        cand12 = str(next_base).zfill(12)
        chk = calculate_ean13_checksum(cand12)
        cand13 = cand12 + chk
        if not Product.objects.filter(barcode__icontains=cand13).exists():
            return cand13
        next_base += 1

    # High-concurrency fallback using timestamp
    ts_digits = str(int(time.time() * 1000))[-pad_len:]
    fallback12 = f"{clean_prefix}{ts_digits}"[:12].zfill(12)
    return fallback12 + calculate_ean13_checksum(fallback12)
