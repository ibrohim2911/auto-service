import os
import re
import zipfile
import xml.etree.ElementTree as ET
from django.core.management.base import BaseCommand
from django.db import transaction
from api.models import Product

class Command(BaseCommand):
    help = 'Sync and append artikuls from Excel file to product barcodes without clearing database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default='Книга1.xlsx2.xlsx',
            help='Path to excel file'
        )

    def handle(self, *args, **options):
        file_path = options['file']
        if not os.path.exists(file_path):
            self.stderr.write(self.style.ERROR(f"File not found: {file_path}"))
            return

        self.stdout.write(f"Reading {file_path}...")
        z = zipfile.ZipFile(file_path)

        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            tree = ET.parse(z.open('xl/sharedStrings.xml'))
            for si in tree.getroot():
                t = si.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                if t is not None:
                    strings.append(t.text or '')
                else:
                    texts = [
                        r.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t').text or ''
                        for r in si.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}r')
                        if r.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t') is not None
                    ]
                    strings.append(''.join(texts))

        ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
        context = ET.iterparse(z.open('xl/worksheets/sheet1.xml'), events=('end',))
        col_letter = re.compile(r'([A-Z]+)')

        header_map = {}
        matched = 0
        updated = 0

        with transaction.atomic():
            for event, elem in context:
                if elem.tag == f'{ns}row':
                    r = int(elem.get('r', 0))
                    row_dict = {}
                    for c in elem.findall(f'{ns}c'):
                        ref = c.get('r', '')
                        m = col_letter.match(ref)
                        if m:
                            col = m.group(1)
                            t = c.get('t')
                            v = c.find(f'{ns}v')
                            val = v.text if v is not None else ''
                            if t == 's' and val != '':
                                val = strings[int(val)] if int(val) < len(strings) else val
                            row_dict[col] = val.strip() if isinstance(val, str) else val

                    if r == 2:
                        for col, val in row_dict.items():
                            txt = str(val).lower()
                            if 'артикул' in txt or 'artikul' in txt:
                                header_map['artikul'] = col
                            elif 'наименование' in txt or 'nomi' in txt:
                                header_map['name'] = col
                            elif 'код' in txt or 'code' in txt:
                                header_map['code'] = col
                            elif 'штрих' in txt or 'barcode' in txt:
                                header_map['barcode'] = col

                    elif r > 2:
                        name = row_dict.get(header_map.get('name', 'B'), '')
                        art = str(row_dict.get(header_map.get('artikul', 'F'), '')).strip()
                        code = str(row_dict.get(header_map.get('code', 'A'), '')).strip()

                        if name and art:
                            p = Product.objects.filter(name=name[:255]).first()
                            if p:
                                matched += 1
                                current_parts = [b.strip() for b in p.barcode.split(',') if b.strip()]
                                if art not in current_parts:
                                    current_parts.append(art)
                                    new_barcode = ', '.join(current_parts)
                                    # Ensure unique
                                    if Product.objects.filter(barcode=new_barcode).exclude(pk=p.pk).exists():
                                        new_barcode = f"{new_barcode}_{code or p.id}"
                                    p.barcode = new_barcode[:255]
                                    p.save(update_fields=['barcode'])
                                    updated += 1
                    elem.clear()

        self.stdout.write(self.style.SUCCESS(f"Finished {file_path}: Matched {matched} products, Updated {updated} with artikul."))
