from django.db import models
from django.contrib.auth.models import AbstractUser
from simple_history.models import HistoricalRecords

class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Created At")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Updated At")

    class Meta:
        abstract = True

from django.contrib.auth.models import BaseUserManager

class CustomUserManager(BaseUserManager):
    def create_user(self, phone_number, password=None, **extra_fields):
        if not phone_number:
            raise ValueError('The Phone Number must be set')
        user = self.model(phone_number=phone_number, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, phone_number, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(phone_number, password, **extra_fields)

class User(AbstractUser, TimeStampedModel):
    ROLE_CHOICES = (
        ('ADMIN', 'Admin'),
        ('MANAGER', 'Manager'),
        ('CASHIER', 'Cashier'),
        ('WORKER', 'Worker'),
    )
    phone_number = models.CharField(max_length=20, unique=True, verbose_name="Phone Number (Raqam)")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='WORKER', verbose_name="Role")
    job = models.CharField(max_length=100, blank=True, null=True, verbose_name="Job")
    history = HistoricalRecords()

    USERNAME_FIELD = 'phone_number'
    REQUIRED_FIELDS = ['username', 'first_name', 'last_name']
    
    objects = CustomUserManager()
    
    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.phone_number})"


class Category(TimeStampedModel):
    name = models.CharField(max_length=100, verbose_name="Category Name")
    history = HistoricalRecords()

    class Meta:
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.name

class Unit(TimeStampedModel):
    name = models.CharField(max_length=50, verbose_name="Unit Name (e.g. Kilogram)")
    short_name = models.CharField(max_length=10, verbose_name="Short Name (e.g. KG)")
    history = HistoricalRecords()

    def __str__(self):
        return f"{self.name} ({self.short_name})"

class CurrencySetting(TimeStampedModel):
    code = models.CharField(max_length=10, default='USD', unique=True, verbose_name="Currency Code")
    name = models.CharField(max_length=50, default="AQSH Dollari", verbose_name="Currency Name")
    symbol = models.CharField(max_length=10, default="$", verbose_name="Symbol")
    rate_in_uzs = models.DecimalField(max_digits=15, decimal_places=2, default=12500.00, verbose_name="Rate in UZS (1 USD = X UZS)")
    is_active = models.BooleanField(default=True, verbose_name="Is Active")
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Currency Setting"
        verbose_name_plural = "Currency Settings"

    @classmethod
    def get_usd_rate(cls):
        setting = cls.objects.filter(code='USD').first()
        if not setting:
            setting = cls.objects.create(code='USD', name="AQSH Dollari", symbol="$", rate_in_uzs=12500.00)
        return setting.rate_in_uzs

    def __str__(self):
        return f"1 {self.code} = {self.rate_in_uzs} UZS"

class Product(TimeStampedModel):
    name = models.CharField(max_length=255, verbose_name="Product Name (Nomi)")
    barcode = models.CharField(max_length=100, unique=True, blank=True, verbose_name="Barcode")
    image = models.ImageField(upload_to='products/', null=True, blank=True, verbose_name="Image (Rasm)")
    unit = models.ForeignKey(Unit, on_delete=models.SET_NULL, null=True, blank=True, related_name='products', verbose_name="Unit (Olchov)")
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name='products', verbose_name="Category")
    cost_price = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, verbose_name="Cost Price (Tan narx)")
    selling_price = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, verbose_name="Selling Price (Sotuv narx)")
    cost_price_usd = models.DecimalField(max_digits=15, decimal_places=4, default=0.0000, verbose_name="Cost Price USD ($)")
    selling_price_usd = models.DecimalField(max_digits=15, decimal_places=4, default=0.0000, verbose_name="Selling Price USD ($)")
    low_stock_threshold = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True, verbose_name="Low Stock Threshold")
    history = HistoricalRecords()

    def save(self, *args, **kwargs):
        from decimal import Decimal
        if not self.barcode:
            from django.db import connection
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT MAX(CAST(barcode AS INTEGER)) FROM api_product WHERE barcode GLOB '[0-9]*' AND length(barcode) <= 8")
                    row = cursor.fetchone()
                    max_code = row[0] if (row and row[0]) else 1000
                    next_code = max_code + 1
                    while Product.objects.filter(barcode=str(next_code)).exists():
                        next_code += 1
                    self.barcode = str(next_code)
            except Exception:
                import time
                self.barcode = str(int(time.time()))[-8:]

        try:
            usd_rate = Decimal(str(CurrencySetting.get_usd_rate()))
        except Exception:
            usd_rate = Decimal('12500.00')

        if self.pk:
            try:
                orig = Product.objects.filter(pk=self.pk).values('cost_price', 'cost_price_usd', 'selling_price', 'selling_price_usd').first()
                if orig:
                    if self.cost_price_usd != orig['cost_price_usd']:
                        self.cost_price = round(Decimal(str(self.cost_price_usd or 0)) * usd_rate, 2)
                    elif self.cost_price != orig['cost_price']:
                        self.cost_price_usd = round(Decimal(str(self.cost_price or 0)) / usd_rate, 4) if usd_rate else Decimal('0')

                    if self.selling_price_usd != orig['selling_price_usd']:
                        self.selling_price = round(Decimal(str(self.selling_price_usd or 0)) * usd_rate, 2)
                    elif self.selling_price != orig['selling_price']:
                        self.selling_price_usd = round(Decimal(str(self.selling_price or 0)) / usd_rate, 4) if usd_rate else Decimal('0')
            except Exception:
                pass
        else:
            if self.cost_price_usd and Decimal(str(self.cost_price_usd)) > 0:
                if not self.cost_price or Decimal(str(self.cost_price)) == 0:
                    self.cost_price = round(Decimal(str(self.cost_price_usd)) * usd_rate, 2)
            elif self.cost_price and Decimal(str(self.cost_price)) > 0:
                if not self.cost_price_usd or Decimal(str(self.cost_price_usd)) == 0:
                    self.cost_price_usd = round(Decimal(str(self.cost_price)) / usd_rate, 4)

            if self.selling_price_usd and Decimal(str(self.selling_price_usd)) > 0:
                if not self.selling_price or Decimal(str(self.selling_price)) == 0:
                    self.selling_price = round(Decimal(str(self.selling_price_usd)) * usd_rate, 2)
            elif self.selling_price and Decimal(str(self.selling_price)) > 0:
                if not self.selling_price_usd or Decimal(str(self.selling_price_usd)) == 0:
                    self.selling_price_usd = round(Decimal(str(self.selling_price)) / usd_rate, 4)

        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

class Inventory(TimeStampedModel):
    LOCATION_CHOICES = (
        ('STORE', 'Store (Magazin)'),
        ('WAREHOUSE', 'Warehouse (Sklad)'),
    )
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='inventory', verbose_name="Product")
    location = models.CharField(max_length=20, choices=LOCATION_CHOICES, verbose_name="Location")
    quantity = models.DecimalField(max_digits=15, decimal_places=3, default=0.000, verbose_name="Quantity (Soni)")
    history = HistoricalRecords()

    class Meta:
        unique_together = ('product', 'location')
        verbose_name_plural = "Inventories"
        
    def __str__(self):
        return f"{self.product.name} - {self.get_location_display()} ({self.quantity})"

class StockTransfer(TimeStampedModel):
    FROM_LOCATION_CHOICES = (
        ('WAREHOUSE', 'Warehouse (Sklad)'),
        ('STORE', 'Store (Magazin)'),
        ('EXTERNAL', 'External (Boshqa joydan / Kirim)'),
    )
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='stock_transfers', verbose_name="Product (Mahsulot)")
    from_location = models.CharField(max_length=20, choices=FROM_LOCATION_CHOICES, verbose_name="From Location (Qayerdan)")
    to_location = models.CharField(max_length=20, choices=Inventory.LOCATION_CHOICES, verbose_name="To Location (Qayerga)")
    quantity = models.DecimalField(max_digits=15, decimal_places=3, verbose_name="Quantity (Miqdor)")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Transferred By (Xodim)")
    note = models.TextField(blank=True, default='', verbose_name="Note (Izoh)")
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Stock Transfer"
        verbose_name_plural = "Stock Transfers"
        ordering = ['-id']

    def __str__(self):
        return f"{self.product.name}: {self.from_location} -> {self.to_location} ({self.quantity})"

class Client(TimeStampedModel):
    name = models.CharField(max_length=255, verbose_name="Client Name (Nomi)")
    is_company = models.BooleanField(default=False, verbose_name="Is Company? (Tashkilotmi?)")
    phone_number = models.CharField(max_length=20, blank=True, null=True, verbose_name="Phone Number (Tel raqam)")
    account_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="Account Number (Hisob raqam)")
    history = HistoricalRecords()
    
    def __str__(self):
        return self.name

class Car(TimeStampedModel):
    plate_number = models.CharField(max_length=20, unique=True, verbose_name="Plate Number (Avto raqam)")
    owner = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True, blank=True, related_name='cars', verbose_name="Owner (Egasi)")
    car_type = models.CharField(max_length=100, blank=True, default='', verbose_name="Car Type (Turi)")
    history = HistoricalRecords()
    
    def __str__(self):
        return f"{self.plate_number} ({self.car_type})" if self.car_type else self.plate_number

class ProductReceipt(TimeStampedModel):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, verbose_name="Received By")
    date = models.DateTimeField(auto_now_add=True, verbose_name="Date")
    total_cost = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name="Total Cost")
    history = HistoricalRecords()

    def __str__(self):
        return f"Receipt #{self.id} on {self.date.strftime('%Y-%m-%d %H:%M')}"

class PaymentMethod(TimeStampedModel):
    name = models.CharField(max_length=50, unique=True, verbose_name="Method Name")
    history = HistoricalRecords()

    def __str__(self):
        return self.name

class ProductReceiptItem(TimeStampedModel):
    receipt = models.ForeignKey(ProductReceipt, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, verbose_name="Product (Mahsulot)")
    cost_price = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, verbose_name="Cost Price (Tan narx)")
    cost_price_usd = models.DecimalField(max_digits=15, decimal_places=4, default=0.0000, verbose_name="Cost Price USD ($)")
    quantity = models.DecimalField(max_digits=15, decimal_places=3, verbose_name="Quantity (Qiymati)")
    remaining_quantity = models.DecimalField(max_digits=15, decimal_places=3, default=0.000, verbose_name="Remaining Qty")
    total_value = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, verbose_name="Total Value")
    destination = models.CharField(max_length=20, choices=Inventory.LOCATION_CHOICES, default='WAREHOUSE', verbose_name="Destination Location")
    history = HistoricalRecords()

    def save(self, *args, **kwargs):
        from decimal import Decimal
        try:
            usd_rate = Decimal(str(CurrencySetting.get_usd_rate()))
        except Exception:
            usd_rate = Decimal('12500.00')

        if self.cost_price_usd and Decimal(str(self.cost_price_usd)) > 0:
            if not self.cost_price or Decimal(str(self.cost_price)) == 0:
                self.cost_price = round(Decimal(str(self.cost_price_usd)) * usd_rate, 2)
        elif self.cost_price and Decimal(str(self.cost_price)) > 0:
            if not self.cost_price_usd or Decimal(str(self.cost_price_usd)) == 0:
                self.cost_price_usd = round(Decimal(str(self.cost_price)) / usd_rate, 4)

        if not self.total_value:
            self.total_value = round(Decimal(str(self.cost_price)) * Decimal(str(self.quantity)), 2)
        if not self.remaining_quantity:
            self.remaining_quantity = self.quantity
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quantity} x {self.product.name}"

class Sale(TimeStampedModel):
    client = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True, blank=True, related_name='sales', verbose_name="Client (Klent)")
    car = models.ForeignKey(Car, on_delete=models.SET_NULL, null=True, blank=True, related_name='sales', verbose_name="Car (Mashina)")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, verbose_name="Sold By")
    payment_type = models.ForeignKey(PaymentMethod, on_delete=models.SET_NULL, null=True, verbose_name="Payment Type (Tulov turi)")
    shift = models.ForeignKey('Shift', on_delete=models.SET_NULL, null=True, blank=True, related_name='sales', verbose_name="Shift (Smena)")
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, verbose_name="Total Amount (Opshi)")
    paid_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, verbose_name="Paid Amount (Tolangan)")
    debt_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, verbose_name="Debt Amount (Qarz)")
    due_date = models.DateField(null=True, blank=True, verbose_name="Due Date (Muddat)")
    datetime = models.DateTimeField(auto_now_add=True, verbose_name="Sale Date")
    history = HistoricalRecords()

    def __str__(self):
        return f"Sale #{self.id} - {self.total_amount}"

class SaleItem(TimeStampedModel):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, verbose_name="Product")
    quantity = models.DecimalField(max_digits=15, decimal_places=3, verbose_name="Quantity (Qiymati)")
    price = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="Price (Narx)")
    total = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="Total")
    total_cost = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, verbose_name="Total Cost")
    history = HistoricalRecords()

    def __str__(self):
        return f"{self.quantity} x {self.product.name}"

class Shift(TimeStampedModel):
    STATUS_CHOICES = (
        ('OPEN', 'Open (Ochiq)'),
        ('CLOSED', 'Closed (Yopiq)'),
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="User")
    opened_at = models.DateTimeField(auto_now_add=True, verbose_name="Opened At (Ochilgan)")
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name="Closed At (Yopilgan)")
    starting_cash = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name="Starting Cash (Boshlangan pul)")
    expected_cash = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name="Expected Cash (Kutilgan pul)")
    actual_cash = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name="Actual Cash (Bor pul)")
    difference = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name="Difference (Rasnitsa)")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='OPEN', verbose_name="Status (Holati)")
    notes = models.TextField(blank=True, null=True, verbose_name="Notes (Izoh)")
    history = HistoricalRecords()

    class Meta:
        ordering = ['-opened_at']

    def __str__(self):
        return f"Shift #{self.id} - {self.user.username} ({self.status})"

class CashFlow(TimeStampedModel):
    TRANSACTION_TYPES = (
        ('INCOME', 'Income (Kirim)'),
        ('EXPENSE', 'Expense (Chiqim)')
    )
    CATEGORIES = (
        ('SALE', 'Sale Payment'),
        ('DEBT', 'Debt Collection/Payment'),
        ('SUPPLIER', 'Supplier Payment'),
        ('BILL', 'Bill Payment'),
        ('TRANSFER', 'Account Transfer (Kompaniyalar aro)'),
        ('OTHER', 'Other')
    )
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES, verbose_name="Type (Kirim/Chiqim)")
    category = models.CharField(max_length=20, choices=CATEGORIES, verbose_name="Category")
    amount = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="Amount")
    payment_method = models.ForeignKey(PaymentMethod, on_delete=models.SET_NULL, null=True, verbose_name="Payment Method")
    shift = models.ForeignKey('Shift', on_delete=models.SET_NULL, null=True, blank=True, related_name='cash_flows', verbose_name="Shift (Smena)")
    client = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions', verbose_name="Client")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, verbose_name="Processed By")
    sale = models.ForeignKey(Sale, on_delete=models.SET_NULL, null=True, blank=True, related_name='payments', verbose_name="Related Sale")
    description = models.TextField(blank=True, null=True, verbose_name="Description/Notes")
    datetime = models.DateTimeField(auto_now_add=True, verbose_name="Transaction Date")
    history = HistoricalRecords()

    def __str__(self):
        return f"{self.get_transaction_type_display()} - {self.amount}"

class Debt(TimeStampedModel):
    DEBT_TYPES = (
        ('GIVEN', 'Given (Biz qarz berdik)'),
        ('TAKEN', 'Taken (Biz qarz oldik)'),
    )
    STATUS_CHOICES = (
        ('UNPAID', 'Unpaid (Tulanmagan)'),
        ('PARTIAL', 'Partially Paid (Qisman tulangan)'),
        ('PAID', 'Paid (Tulangan)'),
    )
    
    sale = models.ForeignKey(Sale, on_delete=models.SET_NULL, null=True, blank=True, related_name='debts', verbose_name="Related Sale")
    client = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True, blank=True, related_name='debts', verbose_name="Client/Entity")
    person_name = models.CharField(max_length=255, blank=True, null=True, verbose_name="Name (if no client record)")
    debt_type = models.CharField(max_length=10, choices=DEBT_TYPES, verbose_name="Debt Type")
    amount = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="Total Amount")
    paid_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0.00, verbose_name="Paid Amount")
    due_date = models.DateField(null=True, blank=True, verbose_name="Due Date (Qaytarish sanasi)")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='UNPAID', verbose_name="Status")
    description = models.TextField(blank=True, null=True, verbose_name="Description/Notes")
    history = HistoricalRecords()

    def __str__(self):
        return f"{self.get_debt_type_display()} - {self.person_name or self.client} ({self.amount})"


class PrinterSetting(TimeStampedModel):
    PRINTER_TYPES = (
        ('CASHIER_CHEQUE', 'Cashier Cheque (with price)'),
        ('WORKER_CHEQUE', 'Worker Cheque (without price)'),
        ('BARCODE', 'Barcode Label'),
    )
    CONNECTION_TYPES = (
        ('WINDOWS', 'Windows Spooler (USB / Driver)'),
        ('NETWORK', 'Network (TCP/IP Port 9100)'),
        ('DISABLED', 'Disabled'),
    )
    COMMAND_TYPES = (
        ('TSPL', 'TSPL (Thermal Label Printers)'),
        ('ESCPOS', 'ESC/POS (Thermal Receipt Printers)'),
        ('RAW_TEXT', 'Plain Text'),
    )

    printer_type = models.CharField(max_length=30, choices=PRINTER_TYPES, unique=True, verbose_name="Printer Type")
    name = models.CharField(max_length=100, blank=True, verbose_name="Display Name")
    connection_type = models.CharField(max_length=20, choices=CONNECTION_TYPES, default='WINDOWS', verbose_name="Connection Type")
    printer_name = models.CharField(max_length=255, blank=True, default='', verbose_name="Windows Printer Name")
    ip_address = models.CharField(max_length=100, blank=True, default='', verbose_name="IP Address")
    port = models.IntegerField(default=9100, verbose_name="Port")
    paper_width = models.CharField(max_length=10, default='80MM', choices=(('80MM', '80mm'), ('58MM', '58mm')), verbose_name="Paper Width")
    label_width = models.IntegerField(default=50, verbose_name="Label Width (mm)")
    label_height = models.IntegerField(default=30, verbose_name="Label Height (mm)")
    command_type = models.CharField(max_length=20, choices=COMMAND_TYPES, default='ESCPOS', verbose_name="Command Type")
    is_enabled = models.BooleanField(default=True, verbose_name="Is Enabled")
    auto_print = models.BooleanField(default=False, verbose_name="Auto-print on Sale")
    history = HistoricalRecords()

    @classmethod
    def get_default_settings(cls):
        defaults = [
            {
                'printer_type': 'CASHIER_CHEQUE',
                'name': "Kassir cheki (Narx bilan)",
                'connection_type': 'WINDOWS',
                'paper_width': '80MM',
                'command_type': 'ESCPOS',
                'auto_print': True,
                'is_enabled': True,
            },
            {
                'printer_type': 'WORKER_CHEQUE',
                'name': "Ishchi cheki (Narxsiz)",
                'connection_type': 'WINDOWS',
                'paper_width': '80MM',
                'command_type': 'ESCPOS',
                'auto_print': False,
                'is_enabled': True,
            },
            {
                'printer_type': 'BARCODE',
                'name': "Chiziqli belgi (Barcode)",
                'connection_type': 'WINDOWS',
                'label_width': 50,
                'label_height': 30,
                'command_type': 'TSPL',
                'auto_print': False,
                'is_enabled': True,
            },
        ]
        for d in defaults:
            p_type = d.pop('printer_type')
            cls.objects.get_or_create(printer_type=p_type, defaults=d)
        return cls.objects.all().order_by('id')

    def __str__(self):
        return f"{self.get_printer_type_display()} ({self.printer_name or self.ip_address or 'Not configured'})"

