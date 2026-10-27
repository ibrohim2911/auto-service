import os
import re
import zipfile
import xml.etree.ElementTree as ET
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from api.models import (
    User, Category, Unit, Product, Inventory, StockTransfer,
    Client, Car, ProductReceipt, ProductReceiptItem, Sale, SaleItem,
    Shift, CashFlow, Debt
)

class Command(BaseCommand):
    help = 'Import products from Excel file (Книга1.xlsx2.xlsx) after clearing app data (preserving users)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default='Книга1.xlsx2.xlsx',
            help='Path to excel file'
        )

    def parse_decimal(self, val, default='0.00'):
        if not val:
            return Decimal(default)
        s = str(val).replace(' ', '').replace('\xa0', '').replace(',', '.')
        try:
            return Decimal(s).quantize(Decimal('0.01'))
        except Exception:
            return Decimal(default)

    def parse_quantity(self, val):
        if not val:
            return Decimal('0.000')
        s = str(val).replace(' ', '').replace('\xa0', '').replace(',', '.')
        try:
            return Decimal(s).quantize(Decimal('0.001'))
        except Exception:
            return Decimal('0.000')

    def handle(self, *args, **options):
        file_path = options['file']
        if not os.path.exists(file_path):
            self.stderr.write(self.style.ERROR(f"File not found: {file_path}"))
            return

        self.stdout.write(f"Reading {file_path}...")
        z = zipfile.ZipFile(file_path)

        # 1. Read shared strings
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
        self.stdout.write(f"Loaded {len(strings)} shared strings.")

        # 2. Parse sheet1.xml
        ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
        context = ET.iterparse(z.open('xl/worksheets/sheet1.xml'), events=('end',))
        col_letter = re.compile(r'([A-Z]+)')

        products_data = []
        seen_barcodes = set()

        header_map = {}

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
                    # Dynamically inspect header row
                    for col, val in row_dict.items():
                        txt = str(val).lower()
                        if 'артикул' in txt or 'artikul' in txt:
                            header_map['artikul'] = col
                        elif 'штрих' in txt or 'barcode' in txt:
                            header_map['barcode'] = col
                        elif 'код' in txt or 'code' in txt:
                            header_map['code'] = col
                        elif 'наименование' in txt or 'nomi' in txt:
                            header_map['name'] = col
                        elif 'количество' in txt:
                            header_map['qty'] = col
                        elif 'себестоимость' in txt:
                            header_map['cost'] = col
                        elif 'реализации' in txt:
                            header_map['selling'] = col
                        elif 'изм' in txt:
                            header_map['unit'] = col

                elif r > 2:
                    name_col = header_map.get('name', 'B')
                    name = row_dict.get(name_col, '')
                    if name:
                        code = str(row_dict.get(header_map.get('code', 'A'), '')).strip()
                        raw_barcode = str(row_dict.get(header_map.get('barcode', 'J'), '')).strip()
                        raw_artikul = str(row_dict.get(header_map.get('artikul', 'F'), '')).strip()
                        raw_unit = str(row_dict.get(header_map.get('unit', 'G'), '')).strip().lower()

                        cost_price = self.parse_decimal(row_dict.get(header_map.get('cost', 'I')))
                        selling_price = self.parse_decimal(row_dict.get(header_map.get('selling', 'L')))
                        quantity = self.parse_quantity(row_dict.get(header_map.get('qty', 'C')))

                        # Combine raw_barcode and artikul
                        bc_parts = []
                        if raw_barcode:
                            for part in raw_barcode.split(','):
                                p_clean = part.strip()
                                if p_clean and p_clean not in bc_parts:
                                    bc_parts.append(p_clean)
                        if raw_artikul and raw_artikul not in bc_parts:
                            bc_parts.append(raw_artikul)

                        barcode = ', '.join(bc_parts)
                        if not barcode or barcode in seen_barcodes:
                            barcode = code if code and code not in seen_barcodes else f"{code or 'item'}_{len(products_data)+1}"

                        seen_barcodes.add(barcode)

                        products_data.append({
                            'code': code,
                            'name': name[:255],
                            'barcode': barcode[:255],
                            'unit_str': raw_unit,
                            'cost_price': cost_price,
                            'selling_price': selling_price,
                            'quantity': quantity
                        })
                elem.clear()

        self.stdout.write(f"Parsed {len(products_data)} valid product rows from Excel.")

        # 3. Database operations inside atomic transaction
        with transaction.atomic():
            self.stdout.write("Deleting existing application data (preserving users)...")
            
            # Delete in foreign key order
            SaleItem.objects.all().delete()
            Sale.objects.all().delete()
            CashFlow.objects.all().delete()
            Debt.objects.all().delete()
            Shift.objects.all().delete()
            StockTransfer.objects.all().delete()
            ProductReceiptItem.objects.all().delete()
            ProductReceipt.objects.all().delete()
            Inventory.objects.all().delete()
            Car.objects.all().delete()
            Client.objects.all().delete()
            Product.objects.all().delete()
            Category.objects.all().delete()
            Unit.objects.all().delete()

            # Clear historical records
            try:
                from api.models import (
                    HistoricalSaleItem, HistoricalSale, HistoricalCashFlow,
                    HistoricalDebt, HistoricalShift, HistoricalStockTransfer,
                    HistoricalProductReceiptItem, HistoricalProductReceipt,
                    HistoricalInventory, HistoricalCar, HistoricalClient,
                    HistoricalProduct, HistoricalCategory, HistoricalUnit
                )
                HistoricalSaleItem.objects.all().delete()
                HistoricalSale.objects.all().delete()
                HistoricalCashFlow.objects.all().delete()
                HistoricalDebt.objects.all().delete()
                HistoricalShift.objects.all().delete()
                HistoricalStockTransfer.objects.all().delete()
                HistoricalProductReceiptItem.objects.all().delete()
                HistoricalProductReceipt.objects.all().delete()
                HistoricalInventory.objects.all().delete()
                HistoricalCar.objects.all().delete()
                HistoricalClient.objects.all().delete()
                HistoricalProduct.objects.all().delete()
                HistoricalCategory.objects.all().delete()
                HistoricalUnit.objects.all().delete()
            except Exception as e:
                self.stdout.write(f"Note on historical clean: {e}")

            self.stdout.write(self.style.SUCCESS("Existing data cleared."))

            # Setup Units
            unit_map = {
                'шт': Unit.objects.create(name='Dona', short_name='dona'),
                'компл': Unit.objects.create(name='Komplekt', short_name='kompl'),
                'литр': Unit.objects.create(name='Litr', short_name='L'),
                'м': Unit.objects.create(name='Metr', short_name='m'),
            }
            default_unit = unit_map['шт']

            # Setup Category
            default_category = Category.objects.create(name='Ehtiyot qismlar')

            # Initial ProductReceipt for FIFO traceability
            admin_user = User.objects.first()
            receipt = ProductReceipt.objects.create(
                user=admin_user,
                total_cost=Decimal('0.00')
            )

            # Bulk create Products
            self.stdout.write("Inserting products...")
            product_objects = []
            for p in products_data:
                unit_obj = unit_map.get(p['unit_str'], default_unit)
                product_objects.append(
                    Product(
                        name=p['name'],
                        barcode=p['barcode'],
                        unit=unit_obj,
                        category=default_category,
                        cost_price=p['cost_price'],
                        selling_price=p['selling_price'],
                    )
                )

            # Insert in chunks
            created_products = Product.objects.bulk_create(product_objects, batch_size=1000)
            self.stdout.write(self.style.SUCCESS(f"Created {len(created_products)} products."))

            # Bulk create Inventory & Receipt Items
            self.stdout.write("Creating inventory and FIFO batch records...")
            inventory_objects = []
            receipt_item_objects = []
            total_receipt_cost = Decimal('0.00')

            for p_obj, p_data in zip(created_products, products_data):
                qty = p_data['quantity']
                cost = p_data['cost_price']
                
                # Inventory in Store
                inventory_objects.append(
                    Inventory(
                        product=p_obj,
                        location='STORE',
                        quantity=qty
                    )
                )

                # If quantity > 0, create batch for FIFO sales fulfillment
                if qty > 0:
                    val = qty * cost
                    total_receipt_cost += val
                    receipt_item_objects.append(
                        ProductReceiptItem(
                            receipt=receipt,
                            product=p_obj,
                            cost_price=cost,
                            quantity=qty,
                            remaining_quantity=qty,
                            total_value=val,
                            destination='STORE'
                        )
                    )

            Inventory.objects.bulk_create(inventory_objects, batch_size=1000)
            if receipt_item_objects:
                ProductReceiptItem.objects.bulk_create(receipt_item_objects, batch_size=1000)

            receipt.total_cost = total_receipt_cost
            receipt.save(update_fields=['total_cost'])

            self.stdout.write(self.style.SUCCESS(f"Created {len(inventory_objects)} inventory records."))
            self.stdout.write(self.style.SUCCESS(f"Created {len(receipt_item_objects)} FIFO batch items with total cost: {total_receipt_cost:,.2f} UZS."))

        self.stdout.write(self.style.SUCCESS("Excel import completed successfully!"))
