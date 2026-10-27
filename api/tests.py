from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from api.models import (
    User, Product, Sale, SaleItem, Client, Car, PaymentMethod, PrinterSetting, Unit, Inventory, StockTransfer, Debt,
    SaleService, WorkerTransaction, Shift, CashFlow
)
from api.printer_service import (
    format_cashier_cheque, format_worker_cheque, format_barcode_labels,
    print_sale_tickets, print_product_barcode, execute_test_print
)

class PrinterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            phone_number="+998901234567",
            username="cashier_test",
            first_name="Ali",
            last_name="Valiyev",
            role="CASHIER"
        )
        self.client_entity = Client.objects.create(name="Olim aka", phone_number="+998909876543")
        self.car = Car.objects.create(plate_number="01 A 777 AA", car_type="Chevrolet Cobalt", owner=self.client_entity)
        self.payment_method = PaymentMethod.objects.create(name="Naqd")
        self.unit = Unit.objects.create(name="Dona", short_name="dona")

        self.product = Product.objects.create(
            name="Moy Filtr C-110",
            barcode="2010867156169",
            cost_price=30000,
            selling_price=45000,
            unit=self.unit
        )

        self.sale = Sale.objects.create(
            user=self.user,
            client=self.client_entity,
            car=self.car,
            payment_type=self.payment_method,
            total_amount=90000,
            paid_amount=90000,
            debt_amount=0
        )

        self.sale_item = SaleItem.objects.create(
            sale=self.sale,
            product=self.product,
            quantity=2,
            price=45000,
            total=90000,
            total_cost=60000
        )

        # Ensure default printer settings
        PrinterSetting.get_default_settings()
        for s in PrinterSetting.objects.all():
            s.printer_name = 'Microsoft Print to PDF'
            s.save()

    def test_printer_settings_defaults(self):
        settings = PrinterSetting.objects.all()
        self.assertEqual(settings.count(), 3)
        cashier_s = PrinterSetting.objects.get(printer_type='CASHIER_CHEQUE')
        worker_s = PrinterSetting.objects.get(printer_type='WORKER_CHEQUE')
        barcode_s = PrinterSetting.objects.get(printer_type='BARCODE')

        self.assertTrue(cashier_s.is_enabled)
        self.assertTrue(worker_s.is_enabled)
        self.assertTrue(barcode_s.is_enabled)

    def test_cashier_cheque_contains_prices(self):
        cashier_setting = PrinterSetting.objects.get(printer_type='CASHIER_CHEQUE')
        # 1. Test raster graphic output (silky smooth, non-rough, crisp lines)
        cheque_bytes = format_cashier_cheque(self.sale, cashier_setting)
        self.assertTrue(cheque_bytes.startswith(b'\x1b@'))
        self.assertIn(b'\x1dv0\x00', cheque_bytes)  # GS v 0 raster bit image command
        self.assertTrue(len(cheque_bytes) > 1000)

        # 2. Test text mode fallback contains exact sketch texts and 'No' (NOT '№')
        cashier_setting.command_type = 'RAW_TEXT'
        text_bytes = format_cashier_cheque(self.sale, cashier_setting)
        text = text_bytes.decode('utf-8', errors='ignore')

        self.assertIn("AUTO LUX SERVICE", text)
        self.assertIn("No", text)
        self.assertNotIn("№", text)
        self.assertIn("nomi", text)
        self.assertIn("soni", text)
        self.assertIn("narxi", text)
        self.assertIn("jami", text)
        self.assertIn("Moy Filtr C-110", text)
        self.assertIn("45,000", text)  # Unit price
        self.assertIn("90,000", text)  # Sum price
        self.assertIn("Jami:", text)
        self.assertIn("Chegirma:", text)
        self.assertIn("xaridingiz uchun rahmat", text)

    def test_cashier_cheque_blank_client(self):
        self.sale.client = None
        self.sale.save()
        cashier_setting = PrinterSetting.objects.get(printer_type='CASHIER_CHEQUE')
        cashier_setting.command_type = 'RAW_TEXT'
        text_bytes = format_cashier_cheque(self.sale, cashier_setting)
        text = text_bytes.decode('utf-8', errors='ignore')

        self.assertIn("Mijoz:", text)
        self.assertNotIn(".........", text)

    def test_worker_cheque_without_prices(self):
        worker_setting = PrinterSetting.objects.get(printer_type='WORKER_CHEQUE')
        # 1. Test raster graphic output (silky smooth, non-rough, crisp lines)
        ticket_bytes = format_worker_cheque(self.sale, worker_setting)
        self.assertTrue(ticket_bytes.startswith(b'\x1b@'))
        self.assertIn(b'\x1dv0\x00', ticket_bytes)  # GS v 0 raster bit image command
        self.assertTrue(len(ticket_bytes) > 1000)

        # 2. Test text mode fallback matching cashier layout without prices
        worker_setting.command_type = 'RAW_TEXT'
        text_bytes = format_worker_cheque(self.sale, worker_setting)
        text = text_bytes.decode('utf-8', errors='ignore')

        # Worker cheque must include AUTO LUX SERVICE, No, item name, quantity, and vehicle info
        self.assertIn("AUTO LUX SERVICE", text)
        self.assertIn("No", text)
        self.assertNotIn("№", text)
        self.assertIn("Moy Filtr C-110", text)
        self.assertIn("2 dona", text)
        self.assertIn("01 A 777 AA", text)
        self.assertIn("Chevrolet Cobalt", text)

        # Worker cheque MUST NOT contain prices or financial totals!
        self.assertNotIn("narxi", text)
        self.assertNotIn("45,000", text)
        self.assertNotIn("90,000", text)
        self.assertNotIn("Jami:", text)
        self.assertNotIn("Chegirma:", text)

    def test_barcode_label_quantity_not_hardcoded(self):
        barcode_setting = PrinterSetting.objects.get(printer_type='BARCODE')
        barcode_setting.command_type = 'TSPL'
        barcode_setting.save()

        # Test printing 5 labels
        labels_bytes_5 = format_barcode_labels(self.product, quantity=5, setting=barcode_setting)
        text_5 = labels_bytes_5.decode('utf-8', errors='ignore')
        self.assertIn("PRINT 5, 1", text_5)
        self.assertIn("2010867156169", text_5)
        self.assertIn('"EAN13"', text_5)
        self.assertIn("Moy Filtr C-110", text_5)
        # Barcode must NOT contain price
        self.assertNotIn("Narxi", text_5)
        self.assertNotIn("45000", text_5)

        # Test printing 12 labels
        labels_bytes_12 = format_barcode_labels(self.product, quantity=12, setting=barcode_setting)
        text_12 = labels_bytes_12.decode('utf-8', errors='ignore')
        self.assertIn("PRINT 12, 1", text_12)

    def test_barcode_label_svg_no_price(self):
        from api.printer_service import get_barcode_label_svg
        svg = get_barcode_label_svg(self.product.id)
        self.assertIsNotNone(svg)
        self.assertTrue(svg.startswith('<svg'))
        self.assertIn('shape-rendering:crispEdges', svg)
        self.assertIn(self.product.name, svg)
        # EAN-13 split digits
        self.assertIn("010867", svg)
        self.assertIn("156169", svg)
        self.assertNotIn('Narxi', svg)
        self.assertNotIn('45000', svg)

    def test_api_list_printers(self):
        response = self.client.get('/api/printers/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 3)

    def test_api_available_printers(self):
        response = self.client.get('/api/printers/available-printers/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('printers', response.data)
        self.assertIsInstance(response.data['printers'], list)

    def test_api_print_barcode_dynamic_quantity(self):
        response = self.client.post('/api/printers/print-barcode/', {
            'product_id': self.product.id,
            'quantity': 7
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('quantity'), 7)
        self.assertIn('label_svg', response.data)
        self.assertIn('label_image', response.data)

    def test_api_print_sale_cashier_and_worker(self):
        # Print cashier cheque
        r_cashier = self.client.post(f'/api/sales/{self.sale.id}/print/', {'type': 'cashier'})
        self.assertEqual(r_cashier.status_code, status.HTTP_200_OK)
        self.assertIn('cashier', r_cashier.data['results'])

        # Print worker ticket
        r_worker = self.client.post(f'/api/sales/{self.sale.id}/print/', {'type': 'worker'})
        self.assertEqual(r_worker.status_code, status.HTTP_200_OK)
        self.assertIn('worker', r_worker.data['results'])

        # Print both
        r_both = self.client.post(f'/api/sales/{self.sale.id}/print/', {'type': 'both'})
        self.assertEqual(r_both.status_code, status.HTTP_200_OK)
        self.assertIn('cashier', r_both.data['results'])
        self.assertIn('worker', r_both.data['results'])


class CarAndClientCreationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            phone_number="+998901112233",
            username="cashier_car_test",
            first_name="Jasur",
            last_name="Karimov",
            role="CASHIER"
        )
        self.client.force_authenticate(user=self.user)
        self.payment_method = PaymentMethod.objects.create(name="Naqd")
        self.client_entity = Client.objects.create(name="Botir Rahimov", phone_number="+998901112244")

    def test_create_car_without_owner_orm(self):
        car = Car.objects.create(plate_number="01 X 777 XX", car_type="Cobalt", owner=None)
        self.assertIsNotNone(car.id)
        self.assertIsNone(car.owner)
        self.assertEqual(car.plate_number, "01 X 777 XX")

    def test_create_car_without_owner_api_omitted(self):
        response = self.client.post('/api/cars/', {
            'plate_number': '01 Y 888 YY',
            'car_type': 'Tracker'
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data.get('owner'))
        self.assertEqual(response.data.get('plate_number'), '01 Y 888 YY')
        self.assertEqual(response.data.get('owner_name'), '')

    def test_create_car_without_owner_api_explicit_null(self):
        response = self.client.post('/api/cars/', {
            'plate_number': '01 Z 999 ZZ',
            'car_type': 'Gentra',
            'owner': None
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data.get('owner'))

    def test_create_car_with_owner_api(self):
        response = self.client.post('/api/cars/', {
            'plate_number': '01 M 111 MM',
            'car_type': 'Malibu 2',
            'owner': self.client_entity.id
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data.get('owner'), self.client_entity.id)
        self.assertEqual(response.data.get('owner_name'), self.client_entity.name)

    def test_sale_with_unowned_car_without_client(self):
        car = Car.objects.create(plate_number="01 K 555 KK", car_type="Nexia 3", owner=None)
        sale = Sale.objects.create(
            user=self.user,
            client=None,
            car=car,
            payment_type=self.payment_method,
            total_amount=50000,
            paid_amount=50000,
            debt_amount=0
        )
        self.assertIsNone(sale.client)
        self.assertEqual(sale.car, car)
        self.assertEqual(sale.car.plate_number, "01 K 555 KK")


class StockTransferTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            phone_number="+998905554433",
            username="transfer_tester",
            first_name="Anvar",
            last_name="Saidov",
            role="ADMIN"
        )
        self.client.force_authenticate(user=self.user)
        self.product = Product.objects.create(name="Motor Moyi 5W-30", barcode="55443322", cost_price=80000, selling_price=120000)
        # Create warehouse inventory with 25 units
        self.inv_wh = Inventory.objects.create(product=self.product, location='WAREHOUSE', quantity=25.0)

    def test_stock_transfer_warehouse_to_store_success(self):
        response = self.client.post('/api/stock-transfers/', {
            'product': self.product.id,
            'from_location': 'WAREHOUSE',
            'to_location': 'STORE',
            'quantity': 10.0,
            'note': "Magazinga ko'rgazmaga chiqarildi"
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data.get('product_name'), "Motor Moyi 5W-30")
        self.assertEqual(response.data.get('from_location_display'), "Warehouse (Sklad)")
        self.assertEqual(response.data.get('to_location_display'), "Store (Magazin)")
        self.assertIn("Anvar Saidov", response.data.get('user_name'))

        # Check that inventories were correctly updated
        self.inv_wh.refresh_from_db()
        self.assertEqual(float(self.inv_wh.quantity), 15.0)
        inv_store = Inventory.objects.get(product=self.product, location='STORE')
        self.assertEqual(float(inv_store.quantity), 10.0)

    def test_stock_transfer_insufficient_stock(self):
        response = self.client.post('/api/stock-transfers/', {
            'product': self.product.id,
            'from_location': 'WAREHOUSE',
            'to_location': 'STORE',
            'quantity': 30.0
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("yetarli", response.data.get('error', '').lower())

    def test_stock_transfer_same_location_fails(self):
        response = self.client.post('/api/stock-transfers/', {
            'product': self.product.id,
            'from_location': 'WAREHOUSE',
            'to_location': 'WAREHOUSE',
            'quantity': 5.0
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_stock_transfer_list_and_search(self):
        StockTransfer.objects.create(
            product=self.product,
            from_location='WAREHOUSE',
            to_location='STORE',
            quantity=5.0,
            user=self.user,
            note="Ehtiyot qism"
        )
        response = self.client.get('/api/stock-transfers/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['product_name'], "Motor Moyi 5W-30")

    def test_stock_transfer_delete_reverts_quantities(self):
        # Transfer 10 units
        t = StockTransfer.objects.create(
            product=self.product,
            from_location='WAREHOUSE',
            to_location='STORE',
            quantity=10.0,
            user=self.user
        )
        self.inv_wh.quantity = 15.0
        self.inv_wh.save()
        inv_store = Inventory.objects.create(product=self.product, location='STORE', quantity=10.0)

        # Delete transfer via API
        response = self.client.delete(f'/api/stock-transfers/{t.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        self.inv_wh.refresh_from_db()
        inv_store.refresh_from_db()
        self.assertEqual(float(self.inv_wh.quantity), 25.0)
        self.assertEqual(float(inv_store.quantity), 0.0)

    def test_stock_transfer_external_inflow_success(self):
        response = self.client.post('/api/stock-transfers/', {
            'product': self.product.id,
            'from_location': 'EXTERNAL',
            'to_location': 'STORE',
            'quantity': 12.0,
            'note': "Yetkazib beruvchidan keltirildi"
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data.get('is_inflow'))
        self.assertEqual(response.data.get('from_location_display'), "External (Boshqa joydan / Kirim)")
        self.assertEqual(response.data.get('to_location_display'), "Store (Magazin)")

        inv_store = Inventory.objects.get(product=self.product, location='STORE')
        self.assertEqual(float(inv_store.quantity), 12.0)

    def test_product_receipt_automatically_logs_stock_transfer(self):
        receipt_response = self.client.post('/api/receipts/', {
            'items': [{
                'product': self.product.id,
                'location': 'WAREHOUSE',
                'quantity': 20.0,
                'cost_price': 75000.0
            }]
        }, format='json')
        self.assertEqual(receipt_response.status_code, status.HTTP_201_CREATED)

        # Verify a StockTransfer with from_location='EXTERNAL' was automatically recorded
        inflow_transfer = StockTransfer.objects.filter(product=self.product, from_location='EXTERNAL', quantity=20.0).first()
        self.assertIsNotNone(inflow_transfer)
        self.assertEqual(inflow_transfer.to_location, 'WAREHOUSE')
        self.assertIn("Yangi kirim", inflow_transfer.note)
        self.assertEqual(inflow_transfer.user, self.user)

    def test_delete_external_transfer_reverts_stock(self):
        response = self.client.post('/api/stock-transfers/', {
            'product': self.product.id,
            'from_location': 'EXTERNAL',
            'to_location': 'STORE',
            'quantity': 15.0
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        transfer_id = response.data['id']

        inv_store = Inventory.objects.get(product=self.product, location='STORE')
        self.assertEqual(float(inv_store.quantity), 15.0)

        # Delete external transfer
        del_response = self.client.delete(f'/api/stock-transfers/{transfer_id}/')
        self.assertEqual(del_response.status_code, status.HTTP_204_NO_CONTENT)

        inv_store.refresh_from_db()
        self.assertEqual(float(inv_store.quantity), 0.0)


class DebtExpireDateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            phone_number="+998909998877",
            username="cashier_debt_test",
            first_name="Vali",
            role="CASHIER"
        )
        self.client_entity = Client.objects.create(name="Botir Qodirov", phone_number="+998901112233")
        self.car = Car.objects.create(plate_number="01 B 123 BB", car_type="Gentra", owner=self.client_entity)
        self.payment_method = PaymentMethod.objects.create(name="Naqd")
        self.unit = Unit.objects.create(name="Dona", short_name="dona")
        self.product = Product.objects.create(
            name="Motor Moyi 5W30",
            barcode="88800112",
            cost_price=100000,
            selling_price=150000,
            unit=self.unit
        )
        Inventory.objects.create(product=self.product, location='STORE', quantity=50)

    def test_sale_creation_with_debt_auto_assigns_due_date_and_creates_debt(self):
        from django.utils import timezone
        from datetime import timedelta

        response = self.client.post('/api/sales/', {
            'user': self.user.id,
            'client': self.client_entity.id,
            'car': self.car.id,
            'total_amount': 300000.0,
            'paid_amount': 100000.0,
            'debt_amount': 200000.0,
            'print': False,
            'items': [{
                'product': self.product.id,
                'quantity': 2,
                'price': 150000.0,
                'total': 300000.0
            }],
            'payments': [{
                'method': self.payment_method.id,
                'amount': 100000.0
            }]
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        sale_id = response.data['id']
        sale = Sale.objects.get(id=sale_id)

        # 1. Verify due_date was automatically assigned (7 days default)
        expected_due_date = timezone.now().date() + timedelta(days=7)
        self.assertIsNotNone(sale.due_date)
        self.assertEqual(sale.due_date, expected_due_date)

        # 2. Verify linked Debt record was created
        linked_debt = Debt.objects.filter(sale=sale).first()
        self.assertIsNotNone(linked_debt)
        self.assertEqual(float(linked_debt.amount), 200000.0)
        self.assertEqual(float(linked_debt.paid_amount), 0.0)
        self.assertEqual(linked_debt.due_date, expected_due_date)
        self.assertEqual(linked_debt.debt_type, 'GIVEN')
        self.assertEqual(linked_debt.status, 'UNPAID')
        self.assertEqual(linked_debt.client, self.client_entity)

    def test_sale_creation_with_explicit_due_date(self):
        response = self.client.post('/api/sales/', {
            'user': self.user.id,
            'client': self.client_entity.id,
            'car': self.car.id,
            'due_date': '2026-11-20',
            'total_amount': 150000.0,
            'paid_amount': 50000.0,
            'debt_amount': 100000.0,
            'print': False,
            'items': [{
                'product': self.product.id,
                'quantity': 1,
                'price': 150000.0,
                'total': 150000.0
            }],
            'payments': [{
                'method': self.payment_method.id,
                'amount': 50000.0
            }]
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        sale = Sale.objects.get(id=response.data['id'])
        self.assertEqual(str(sale.due_date), '2026-11-20')

        linked_debt = Debt.objects.filter(sale=sale).first()
        self.assertIsNotNone(linked_debt)
        self.assertEqual(str(linked_debt.due_date), '2026-11-20')

    def test_sale_update_syncs_linked_debt(self):
        # Create sale with debt
        sale = Sale.objects.create(
            user=self.user,
            client=self.client_entity,
            car=self.car,
            payment_type=self.payment_method,
            total_amount=150000.0,
            paid_amount=50000.0,
            debt_amount=100000.0,
            due_date='2026-10-25'
        )
        debt = Debt.objects.create(
            sale=sale,
            client=self.client_entity,
            debt_type='GIVEN',
            amount=100000.0,
            due_date='2026-10-25',
            status='UNPAID'
        )

        # Update sale to fully paid
        patch_res = self.client.patch(f'/api/sales/{sale.id}/', {
            'paid_amount': 150000.0,
            'debt_amount': 0.0
        }, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)

        debt.refresh_from_db()
        self.assertEqual(debt.status, 'PAID')

    def test_debt_payment_syncs_back_to_sale(self):
        # Create sale and linked debt
        sale = Sale.objects.create(
            user=self.user,
            client=self.client_entity,
            payment_type=self.payment_method,
            total_amount=200000.0,
            paid_amount=100000.0,
            debt_amount=100000.0,
            due_date='2026-10-30'
        )
        debt = Debt.objects.create(
            sale=sale,
            client=self.client_entity,
            debt_type='GIVEN',
            amount=100000.0,
            paid_amount=0.0,
            due_date='2026-10-30',
            status='UNPAID'
        )

        # Repay 40,000 on the debt
        res = self.client.patch(f'/api/debts/{debt.id}/', {
            'paid_amount': 40000.0,
            'status': 'PARTIAL'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Verify sale is synchronized
        sale.refresh_from_db()
        self.assertEqual(float(sale.debt_amount), 60000.0)
        self.assertEqual(float(sale.paid_amount), 140000.0)


class WorkerTabTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cashier = User.objects.create_user(
            phone_number="+998901112233",
            username="cashier_user",
            first_name="Kassir",
            role="CASHIER"
        )
        self.worker1 = User.objects.create_user(
            phone_number="+998902223344",
            username="usta_ali",
            first_name="Ali",
            role="WORKER",
            job="Motorchi",
            monthly_tool_fee=300000.00
        )
        self.worker2 = User.objects.create_user(
            phone_number="+998903334455",
            username="usta_vali",
            first_name="Vali",
            role="WORKER",
            job="Xodovoychi",
            monthly_tool_fee=250000.00
        )
        self.company = Client.objects.create(
            name="Orient Logistics MCHJ",
            phone_number="+998910001122",
            is_company=True
        )
        self.car = Car.objects.create(
            plate_number="01 A 777 AA",
            car_type="Chevrolet Gentra",
            owner=self.company
        )
        self.payment_method = PaymentMethod.objects.create(name="Naqd")
        self.unit = Unit.objects.create(name="Dona", short_name="dona")
        self.part = Product.objects.create(
            name="Amortizator",
            barcode="11223344",
            cost_price=100000,
            selling_price=150000,
            unit=self.unit
        )
        Inventory.objects.create(product=self.part, quantity=10, location='STORE')

    def test_pos_sale_with_service_fee_and_product(self):
        # 1. Create a sale with 1 product (150,000) + 1 service fee for worker1 (200,000)
        # Total should be 350,000. Paid 0, Debt 350,000.
        payload = {
            'user': self.cashier.id,
            'client': self.company.id,
            'car': self.car.id,
            'total_amount': 350000.0,
            'paid_amount': 0.0,
            'debt_amount': 350000.0,
            'due_date': '2026-11-01',
            'payments': [],
            'items': [
                {'product': self.part.id, 'quantity': 1, 'price': 150000.0, 'total': 150000.0}
            ],
            'services': [
                {'worker': self.worker1.id, 'service_name': "Amortizator almashtirish", 'amount': 200000.0}
            ]
        }
        res = self.client.post('/api/sales/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        sale_id = res.data['id']

        sale = Sale.objects.get(id=sale_id)
        self.assertEqual(float(sale.total_amount), 350000.0)
        self.assertEqual(float(sale.debt_amount), 350000.0)
        self.assertEqual(sale.services.count(), 1)
        self.assertEqual(sale.services.first().worker, self.worker1)

        # 2. Check Worker Tab for worker1
        tab_res = self.client.get(f'/api/worker-tabs/{self.worker1.id}/')
        self.assertEqual(tab_res.status_code, status.HTTP_200_OK)
        summary = tab_res.data['summary']

        # Total service earned should be 200,000
        self.assertEqual(summary['total_service_earned'], 200000.0)
        # Since sale is 100% on debt, paid_service_earned is 0, unpaid_company_debt_service is 200,000
        self.assertEqual(summary['paid_service_earned'], 0.0)
        self.assertEqual(summary['unpaid_company_debt_service'], 200000.0)

        # 3. Company pays off half the debt (175,000 out of 350,000 = 50%)
        debt = Debt.objects.get(sale=sale)
        debt_patch = self.client.patch(f'/api/debts/{debt.id}/', {
            'paid_amount': 175000.0,
            'status': 'PARTIAL'
        }, format='json')
        self.assertEqual(debt_patch.status_code, status.HTTP_200_OK)

        # Refresh Worker Tab: 50% of the service fee should now be realized!
        tab_res2 = self.client.get(f'/api/worker-tabs/{self.worker1.id}/')
        summary2 = tab_res2.data['summary']
        self.assertEqual(summary2['paid_service_earned'], 100000.0)
        self.assertEqual(summary2['unpaid_company_debt_service'], 100000.0)

        # 4. Company pays full remaining debt
        self.client.patch(f'/api/debts/{debt.id}/', {
            'paid_amount': 350000.0,
            'status': 'PAID'
        }, format='json')

        tab_res3 = self.client.get(f'/api/worker-tabs/{self.worker1.id}/')
        summary3 = tab_res3.data['summary']
        self.assertEqual(summary3['paid_service_earned'], 200000.0)
        self.assertEqual(summary3['unpaid_company_debt_service'], 0.0)

    def test_worker_deductions_and_balances(self):
        # 1. Charge monthly tool fee
        fee_res = self.client.post('/api/worker-tabs/charge-monthly-tool-fee/', {
            'worker_id': self.worker1.id,
            'period_month': '2026-10'
        }, format='json')
        self.assertEqual(fee_res.status_code, status.HTTP_200_OK)
        self.assertEqual(fee_res.data['charged_count'], 1)

        # 2. Worker takes an advance
        adv_res = self.client.post('/api/worker-transactions/', {
            'worker': self.worker1.id,
            'transaction_type': 'WORKER_DEBT',
            'amount': 50000.0,
            'period_month': '2026-10',
            'payment_method': 'NONE',
            'note': 'Avans'
        }, format='json')
        self.assertEqual(adv_res.status_code, status.HTTP_201_CREATED)

        # 3. Check worker tab balances:
        # Tool fee = 300,000, Worker debt = 50,000. Total deductions = 350,000.
        tab_res = self.client.get(f'/api/worker-tabs/{self.worker1.id}/?month=2026-10')
        self.assertEqual(tab_res.status_code, status.HTTP_200_OK)
        summary = tab_res.data['summary']
        self.assertEqual(summary['total_tool_fees'], 300000.0)
        self.assertEqual(summary['total_worker_debts'], 50000.0)
        self.assertEqual(summary['total_deductions'], 350000.0)
        self.assertEqual(summary['net_balance_total'], -350000.0)

    def test_all_workers_comparison_list(self):
        res = self.client.get('/api/worker-tabs/?month=2026-10')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('workers', res.data)
        worker_ids = [w['id'] for w in res.data['workers']]
        self.assertIn(self.worker1.id, worker_ids)
        self.assertIn(self.worker2.id, worker_ids)

    def test_dashboard_stats_periods(self):
        # Create a sale with products + service
        sale = Sale.objects.create(
            user=self.cashier,
            client=self.company,
            car=self.car,
            payment_type=self.payment_method,
            total_amount=250000.0,
            paid_amount=150000.0,
            debt_amount=100000.0
        )
        SaleItem.objects.create(
            sale=sale,
            product=self.part,
            quantity=1,
            price=150000.0,
            total=150000.0,
            total_cost=100000.0
        )
        SaleService.objects.create(
            sale=sale,
            worker=self.worker1,
            service_name="Usta tekshiruvi",
            amount=100000.0
        )

        # Test 'today'
        res_today = self.client.get('/api/dashboard-stats/?period=today')
        self.assertEqual(res_today.status_code, status.HTTP_200_OK)
        self.assertIn('financial_summary', res_today.data)
        self.assertIn('live_snapshot', res_today.data)
        self.assertIn('chartData', res_today.data)
        self.assertIn('top_workers', res_today.data)
        self.assertIn('recentSales', res_today.data)

        # Test '7days'
        res_7d = self.client.get('/api/dashboard-stats/?period=7days')
        self.assertEqual(res_7d.status_code, status.HTTP_200_OK)
        self.assertEqual(res_7d.data['financial_summary']['total_revenue'], 250000.0)
        self.assertEqual(res_7d.data['financial_summary']['product_revenue'], 150000.0)
        self.assertEqual(res_7d.data['financial_summary']['service_revenue'], 100000.0)

        # Test 'custom' date range
        res_custom = self.client.get('/api/dashboard-stats/?date_from=2026-10-01&date_to=2026-10-31')
        self.assertEqual(res_custom.status_code, status.HTTP_200_OK)
        self.assertEqual(res_custom.data['period_info']['period'], 'custom')






