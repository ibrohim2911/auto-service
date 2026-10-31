from rest_framework import serializers
from decimal import Decimal
from .models import (
    User, Category, Unit, PaymentMethod, Product, Inventory, StockTransfer, Client, Car, 
    ProductReceipt, ProductReceiptItem, Sale, SaleItem, Shift, CashFlow, Debt, PrinterSetting,
    CurrencySetting, SaleService, WorkerTransaction, ClientTransaction
)

class CurrencySettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = CurrencySetting
        fields = '__all__'

class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'phone_number', 'role', 'job', 'monthly_tool_fee', 'password']
        extra_kwargs = {
            'username': {'required': False},
            'phone_number': {'required': True},
        }

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        if not validated_data.get('username'):
            phone = validated_data.get('phone_number', '').replace('+', '').replace(' ', '')
            validated_data['username'] = phone if phone else f"user_{User.objects.count() + 1}"

        user = User.objects.create_user(password=password, **validated_data)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

class CategorySerializer(serializers.ModelSerializer):
    products_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = Category
        fields = '__all__'

class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = '__all__'

class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = '__all__'

class InventorySerializer(serializers.ModelSerializer):
    location_display = serializers.CharField(source='get_location_display', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_barcode = serializers.CharField(source='product.barcode', read_only=True)
    unit_name = serializers.CharField(source='product.unit.short_name', read_only=True, default='')
    
    class Meta:
        model = Inventory
        fields = '__all__'

class StockTransferSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_barcode = serializers.CharField(source='product.barcode', read_only=True)
    unit_name = serializers.CharField(source='product.unit.short_name', read_only=True, default='')
    user_name = serializers.SerializerMethodField()
    from_location_display = serializers.CharField(source='get_from_location_display', read_only=True)
    to_location_display = serializers.CharField(source='get_to_location_display', read_only=True)
    is_inflow = serializers.SerializerMethodField()

    class Meta:
        model = StockTransfer
        fields = '__all__'

    def get_user_name(self, obj):
        if not obj.user:
            return ''
        name = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return name if name else obj.user.username

    def get_is_inflow(self, obj):
        return obj.from_location == 'EXTERNAL'

class ProductSerializer(serializers.ModelSerializer):
    inventory = InventorySerializer(many=True, read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    unit_name = serializers.CharField(source='unit.short_name', read_only=True)
    total_quantity = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    recent_sales_qty = serializers.DecimalField(max_digits=15, decimal_places=3, read_only=True, required=False)
    usd_rate = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Product
        fields = '__all__'

    def get_usd_rate(self, obj):
        try:
            return float(CurrencySetting.get_usd_rate())
        except Exception:
            return 12500.0

class ClientSerializer(serializers.ModelSerializer):
    worker_name = serializers.SerializerMethodField(read_only=True)
    is_worker = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Client
        fields = '__all__'

    def get_worker_name(self, obj):
        if obj.worker:
            return obj.worker.get_full_name() or obj.worker.username
        return None

    def get_is_worker(self, obj):
        return obj.worker_id is not None

class CarSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source='owner.name', read_only=True, default='')

    class Meta:
        model = Car
        fields = '__all__'
        extra_kwargs = {
            'owner': {'required': False, 'allow_null': True}
        }

class ProductReceiptItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductReceiptItem
        fields = '__all__'
        read_only_fields = ['receipt', 'total_value']

class ProductReceiptSerializer(serializers.ModelSerializer):
    items = ProductReceiptItemSerializer(many=True)
    note = serializers.CharField(required=False, allow_blank=True, write_only=True, default='')
    
    class Meta:
        model = ProductReceipt
        fields = ['id', 'user', 'date', 'total_cost', 'items', 'note']
        read_only_fields = ['total_cost']

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        receipt_note = validated_data.pop('note', '').strip()
        receipt = ProductReceipt.objects.create(**validated_data)
        total_cost = Decimal('0.00')

        try:
            usd_rate = Decimal(str(CurrencySetting.get_usd_rate()))
        except Exception:
            usd_rate = Decimal('12500.00')

        for item_data in items_data:
            qty = Decimal(str(item_data['quantity']))
            cost_val = item_data.get('cost_price')
            cost_usd_val = item_data.get('cost_price_usd')

            cost = Decimal(str(cost_val)) if cost_val is not None else Decimal('0')
            cost_usd = Decimal(str(cost_usd_val)) if cost_usd_val is not None else Decimal('0')

            if cost_usd > 0 and cost == 0:
                cost = round(cost_usd * usd_rate, 2)
            elif cost > 0 and cost_usd == 0:
                cost_usd = round(cost / usd_rate, 4)

            total = round(qty * cost, 2)
            total_cost += total
            location = item_data.get('location', 'WAREHOUSE')
            ProductReceiptItem.objects.create(
                receipt=receipt,
                product=item_data['product'],
                cost_price=cost,
                cost_price_usd=cost_usd,
                quantity=qty,
                remaining_quantity=qty,
                total_value=total,
                destination=location
            )
            # Update overall inventory
            inv, created = Inventory.objects.get_or_create(
                product=item_data['product'],
                location=location,
                defaults={'quantity': 0.0}
            )
            inv.quantity = float(inv.quantity) + float(qty)
            inv.save()

            # Update product's cost_price and cost_price_usd
            prod = item_data['product']
            if cost > 0:
                prod.cost_price = cost
                prod.cost_price_usd = cost_usd
                prod.save()

            # Record in stock transfer / inflow history
            transfer_note = f"Yangi kirim (Kirim #{receipt.id}, tan narxi: ${cost_usd:,.2f} / {cost:,.0f} so'm)"
            if receipt_note:
                transfer_note += f" - {receipt_note}"
            StockTransfer.objects.create(
                product=item_data['product'],
                from_location='EXTERNAL',
                to_location=location,
                quantity=qty,
                user=receipt.user,
                note=transfer_note
            )
        receipt.total_cost = total_cost
        receipt.save()
        return receipt

class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_barcode = serializers.CharField(source='product.barcode', read_only=True)
    unit_name = serializers.CharField(source='product.unit.name', read_only=True)

    class Meta:
        model = SaleItem
        fields = '__all__'
        read_only_fields = ['sale', 'total_cost']

class SaleServiceSerializer(serializers.ModelSerializer):
    worker_name = serializers.SerializerMethodField()

    class Meta:
        model = SaleService
        fields = ['id', 'sale', 'worker', 'worker_name', 'service_name', 'amount', 'amount_usd', 'created_at']
        read_only_fields = ['sale']

    def get_worker_name(self, obj):
        if obj.worker:
            return obj.worker.get_full_name() or obj.worker.username or obj.worker.phone_number
        return "Tayinlanmagan"

class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    services = SaleServiceSerializer(many=True, read_only=True)
    car_plate = serializers.CharField(source='car.plate_number', read_only=True)
    car_type = serializers.CharField(source='car.car_type', read_only=True)
    client_name = serializers.CharField(source='client.name', read_only=True)
    client_phone = serializers.CharField(source='client.phone_number', read_only=True)
    client_account = serializers.CharField(source='client.account_number', read_only=True)
    client_is_company = serializers.BooleanField(source='client.is_company', read_only=True)
    user_name = serializers.CharField(source='user.first_name', read_only=True)
    payment_type_name = serializers.CharField(source='payment_type.name', read_only=True)

    class Meta:
        model = Sale
        fields = '__all__'
        
    def create(self, validated_data):
        from django.utils import timezone
        from datetime import timedelta
        from .models import Debt, PaymentMethod, SaleService

        items_data = self.initial_data.get('items', [])
        services_data = self.initial_data.get('services', [])
        payments_data = self.initial_data.get('payments', [])

        if not items_data and not services_data:
            raise serializers.ValidationError({"detail": "Kamida bitta mahsulot yoki xizmat ko'rsatilishi kerak."})

        # Calculate items and services totals: prefer 'total' if provided, else round(price * quantity)
        items_total = sum(
            round(float(i['total'])) if ('total' in i and i['total'] is not None) else round(float(i.get('price', 0)) * float(i.get('quantity', 1)))
            for i in items_data
        )
        services_total = sum(round(float(s.get('amount', 0))) for s in services_data)
        calc_total = items_total + services_total
        
        if payments_data:
            paid_amount = sum(round(float(p.get('amount', 0))) for p in payments_data)
            validated_data['paid_amount'] = Decimal(str(paid_amount))
            if 'payment_type' not in validated_data and len(payments_data) > 0:
                method = PaymentMethod.objects.filter(id=payments_data[0].get('method')).first()
                validated_data['payment_type'] = method
                
        total_amount = round(float(validated_data.get('total_amount', calc_total)))
        if calc_total > 0 and (total_amount == 0 or 'total_amount' not in validated_data):
            total_amount = calc_total
        validated_data['total_amount'] = Decimal(str(total_amount))

        paid_amount = round(float(validated_data.get('paid_amount', 0)))
        debt_amount = round(float(validated_data.get('debt_amount', max(0.0, total_amount - paid_amount))))
        validated_data['debt_amount'] = Decimal(str(debt_amount))

        # Enforce due_date when sale has debt
        if debt_amount > 0 and not validated_data.get('due_date'):
            validated_data['due_date'] = timezone.now().date() + timedelta(days=7)

        sale = Sale.objects.create(**validated_data)
        
        for item_data in items_data:
            qty_needed = float(item_data['quantity'])
            price = float(item_data['price'])
            if 'total' in item_data and item_data['total'] is not None:
                total = round(float(item_data['total']))
            else:
                total = round(qty_needed * price)
            product_id = item_data['product']
            
            # FIFO logic
            batches = ProductReceiptItem.objects.filter(
                product_id=product_id,
                remaining_quantity__gt=0
            ).order_by('id')
            
            total_cost_for_this_item = 0
            qty_to_fulfill = qty_needed
            
            for batch in batches:
                if qty_to_fulfill <= 0:
                    break
                available = float(batch.remaining_quantity)
                taken = min(available, qty_to_fulfill)
                batch.remaining_quantity = available - taken
                batch.save()
                
                total_cost_for_this_item += taken * float(batch.cost_price)
                qty_to_fulfill -= taken
            
            # Update global inventory count
            # Ideally deduct from specific location, but POS doesn't send location yet, deduct from Store first
            inv = Inventory.objects.filter(product_id=product_id, location='STORE').first()
            if not inv:
                inv = Inventory.objects.filter(product_id=product_id, location='WAREHOUSE').first()
            if inv:
                inv.quantity = float(inv.quantity) - qty_needed
                inv.save()
            
            SaleItem.objects.create(
                sale=sale,
                product_id=product_id,
                quantity=Decimal(str(qty_needed)),
                price=Decimal(str(price)),
                total=Decimal(str(total)),
                total_cost=Decimal(str(round(total_cost_for_this_item, 2)))
            )

        for svc_data in services_data:
            worker_id = svc_data.get('worker')
            if isinstance(worker_id, dict):
                worker_id = worker_id.get('id')
            SaleService.objects.create(
                sale=sale,
                worker_id=worker_id if worker_id else None,
                service_name=svc_data.get('service_name') or "Xizmat haqi",
                amount=Decimal(str(svc_data.get('amount', 0))),
                amount_usd=Decimal(str(svc_data.get('amount_usd', 0)))
            )
            
        # Associate user's active shift if not set
        if not sale.shift and sale.user:
            from .models import Shift
            active_shift = Shift.objects.filter(user=sale.user, status='OPEN').first()
            if active_shift:
                sale.shift = active_shift
                sale.save(update_fields=['shift'])

        if payments_data:
            for p in payments_data:
                amt = float(p.get('amount', 0))
                if amt > 0:
                    CashFlow.objects.create(
                        transaction_type='INCOME',
                        category='SALE',
                        amount=amt,
                        payment_method_id=p.get('method'),
                        shift=sale.shift,
                        client=sale.client,
                        user=sale.user,
                        sale=sale,
                        description=f"Payment for Sale #{sale.id}"
                    )
        elif float(sale.paid_amount) > 0:
            CashFlow.objects.create(
                transaction_type='INCOME',
                category='SALE',
                amount=sale.paid_amount,
                payment_method=sale.payment_type,
                shift=sale.shift,
                client=sale.client,
                user=sale.user,
                sale=sale,
                description=f"Initial payment for Sale #{sale.id}"
            )

        # Create linked Debt record if sale has debt
        if float(sale.debt_amount) > 0:
            person_name = sale.client.name if sale.client else (f"Mashina: {sale.car.plate_number}" if sale.car else f"Sotuv #{sale.id} mijozi")
            Debt.objects.create(
                sale=sale,
                client=sale.client,
                person_name=person_name,
                debt_type='GIVEN',
                amount=sale.debt_amount,
                paid_amount=0.00,
                due_date=sale.due_date,
                status='UNPAID',
                description=f"Sotuv #{sale.id} bo'yicha qarz"
            )
            
        return sale

    def update(self, instance, validated_data):
        from django.utils import timezone
        from datetime import timedelta
        from .models import Debt

        items_data = self.initial_data.get('items', None)
        
        # Update standard fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
            
        if items_data is not None:
            # 1. Revert old items inventory
            for old_item in instance.items.all():
                inv = Inventory.objects.filter(product_id=old_item.product_id, location='STORE').first()
                if not inv:
                    inv = Inventory.objects.filter(product_id=old_item.product_id, location='WAREHOUSE').first()
                if inv:
                    inv.quantity = float(inv.quantity) + float(old_item.quantity)
                    inv.save()
                
                # Try to return to a receipt batch (simple approach: add to latest open batch)
                from .models import ProductReceiptItem
                latest_batch = ProductReceiptItem.objects.filter(product_id=old_item.product_id).order_by('-id').first()
                if latest_batch:
                    latest_batch.remaining_quantity = float(latest_batch.remaining_quantity) + float(old_item.quantity)
                    latest_batch.save()
            
            # Delete old items
            instance.items.all().delete()
            
            # 2. Create new items
            new_total = 0
            from .models import ProductReceiptItem, SaleItem
            for item_data in items_data:
                # Handle cases where product might be passed as an ID or an object dict (if frontend passes full object)
                prod_id = item_data.get('product')
                if isinstance(prod_id, dict):
                    prod_id = prod_id.get('id')
                
                qty_needed = float(item_data.get('quantity', 0))
                price = float(item_data.get('price', 0))
                if 'total' in item_data and item_data['total'] is not None:
                    total = round(float(item_data['total']))
                else:
                    total = round(qty_needed * price)
                new_total += total
                
                # FIFO logic
                batches = ProductReceiptItem.objects.filter(
                    product_id=prod_id,
                    remaining_quantity__gt=0
                ).order_by('id')
                
                total_cost_for_this_item = 0
                qty_to_fulfill = qty_needed
                
                for batch in batches:
                    if qty_to_fulfill <= 0:
                        break
                    available = float(batch.remaining_quantity)
                    taken = min(available, qty_to_fulfill)
                    batch.remaining_quantity = available - taken
                    batch.save()
                    
                    total_cost_for_this_item += taken * float(batch.cost_price)
                    qty_to_fulfill -= taken
                
                # Deduct from Inventory
                inv = Inventory.objects.filter(product_id=prod_id, location='STORE').first()
                if not inv:
                    inv = Inventory.objects.filter(product_id=prod_id, location='WAREHOUSE').first()
                if inv:
                    inv.quantity = float(inv.quantity) - qty_needed
                    inv.save()
                
                SaleItem.objects.create(
                    sale=instance,
                    product_id=prod_id,
                    quantity=Decimal(str(qty_needed)),
                    price=Decimal(str(price)),
                    total=Decimal(str(total)),
                    total_cost=Decimal(str(round(total_cost_for_this_item, 2)))
                )
            
            # Update instance amounts
            services_total = sum(round(float(s.amount)) for s in instance.services.all())
            instance.total_amount = Decimal(str(round(new_total + services_total)))
            instance.debt_amount = Decimal(str(max(0, round(float(instance.total_amount) - float(instance.paid_amount)))))

        services_data = self.initial_data.get('services', None)
        if services_data is not None:
            instance.services.all().delete()
            for svc_data in services_data:
                worker_id = svc_data.get('worker')
                if isinstance(worker_id, dict):
                    worker_id = worker_id.get('id')
                SaleService.objects.create(
                    sale=instance,
                    worker_id=worker_id if worker_id else None,
                    service_name=svc_data.get('service_name') or "Xizmat haqi",
                    amount=Decimal(str(svc_data.get('amount', 0))),
                    amount_usd=Decimal(str(svc_data.get('amount_usd', 0)))
                )
            items_total = sum(round(float(i.total)) for i in instance.items.all())
            services_total = sum(round(float(s.get('amount', 0))) for s in services_data)
            instance.total_amount = Decimal(str(round(items_total + services_total)))
            instance.debt_amount = Decimal(str(max(0, round(float(instance.total_amount) - float(instance.paid_amount)))))

        # Handle payments update
        from .models import CashFlow, PaymentMethod
        payments_data = self.initial_data.get('payments', None)
        if payments_data is not None:
            paid_amount = sum(float(p.get('amount', 0)) for p in payments_data)
            instance.paid_amount = paid_amount
            if len(payments_data) > 0 and payments_data[0].get('method'):
                method = PaymentMethod.objects.filter(id=payments_data[0].get('method')).first()
                if method:
                    instance.payment_type = method
            instance.payments.all().delete()
            for p in payments_data:
                amt = float(p.get('amount', 0))
                if amt > 0:
                    CashFlow.objects.create(
                        transaction_type='INCOME',
                        category='SALE',
                        amount=amt,
                        payment_method_id=p.get('method') or (instance.payment_type.id if instance.payment_type else None),
                        shift=instance.shift,
                        client=instance.client,
                        user=instance.user,
                        sale=instance,
                        description=f"Payment for Sale #{instance.id} (Yangilangan)"
                    )
        elif 'paid_amount' in self.initial_data:
            instance.paid_amount = Decimal(str(self.initial_data['paid_amount']))
            cf = instance.payments.first()
            if cf:
                cf.amount = instance.paid_amount
                if instance.payment_type:
                    cf.payment_method = instance.payment_type
                cf.client = instance.client
                cf.save()
            elif float(instance.paid_amount) > 0:
                CashFlow.objects.create(
                    transaction_type='INCOME',
                    category='SALE',
                    amount=instance.paid_amount,
                    payment_method=instance.payment_type,
                    shift=instance.shift,
                    client=instance.client,
                    user=instance.user,
                    sale=instance,
                    description=f"Payment for Sale #{instance.id} (Yangilangan)"
                )

        if 'total_amount' in self.initial_data and items_data is None and services_data is None:
            instance.total_amount = Decimal(str(self.initial_data['total_amount']))

        instance.debt_amount = max(0, float(instance.total_amount) - float(instance.paid_amount))

        # Enforce due_date and sync Debt model
        if float(instance.debt_amount) > 0:
            if not instance.due_date:
                instance.due_date = timezone.now().date() + timedelta(days=7)
            
            linked_debt = Debt.objects.filter(sale=instance).first()
            person_name = instance.client.name if instance.client else (f"Mashina: {instance.car.plate_number}" if instance.car else f"Sotuv #{instance.id} mijozi")
            if linked_debt:
                linked_debt.amount = instance.debt_amount
                linked_debt.due_date = instance.due_date
                linked_debt.client = instance.client
                if not linked_debt.person_name:
                    linked_debt.person_name = person_name
                if float(linked_debt.paid_amount) >= float(linked_debt.amount):
                    linked_debt.status = 'PAID'
                elif float(linked_debt.paid_amount) > 0:
                    linked_debt.status = 'PARTIAL'
                else:
                    linked_debt.status = 'UNPAID'
                linked_debt.save()
            else:
                Debt.objects.create(
                    sale=instance,
                    client=instance.client,
                    person_name=person_name,
                    debt_type='GIVEN',
                    amount=instance.debt_amount,
                    paid_amount=0.00,
                    due_date=instance.due_date,
                    status='UNPAID',
                    description=f"Sotuv #{instance.id} bo'yicha qarz"
                )
        else:
            # Fully paid
            for d in Debt.objects.filter(sale=instance):
                d.status = 'PAID'
                d.paid_amount = d.amount
                d.save()

        instance.save()
        return instance

class ShiftSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    username = serializers.CharField(source='user.username', read_only=True)
    user_phone = serializers.CharField(source='user.phone_number', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    summary = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        fields = '__all__'

    def get_user_name(self, obj):
        name = obj.user.get_full_name()
        return name if name else obj.user.username

    def get_summary(self, obj):
        from .shift_service import calculate_shift_summary
        return calculate_shift_summary(obj)

class CashFlowSerializer(serializers.ModelSerializer):
    category = serializers.ChoiceField(choices=CashFlow.CATEGORIES, default='OTHER')
    payment_method_name = serializers.CharField(source='payment_method.name', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    client_name = serializers.CharField(source='client.name', read_only=True)
    user_name = serializers.CharField(source='user.first_name', read_only=True)

    class Meta:
        model = CashFlow
        fields = '__all__'

    def create(self, validated_data):
        user = validated_data.get('user')
        if not validated_data.get('shift') and user:
            from .models import Shift
            active_shift = Shift.objects.filter(user=user, status='OPEN').first()
            if active_shift:
                validated_data['shift'] = active_shift
        return super().create(validated_data)

class DebtSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.name', read_only=True)
    sale_id = serializers.IntegerField(source='sale.id', read_only=True)
    
    class Meta:
        model = Debt
        fields = '__all__'


class PrinterSettingSerializer(serializers.ModelSerializer):
    printer_type_display = serializers.CharField(source='get_printer_type_display', read_only=True)
    connection_type_display = serializers.CharField(source='get_connection_type_display', read_only=True)

    class Meta:
        model = PrinterSetting
        fields = '__all__'


class WorkerTransactionSerializer(serializers.ModelSerializer):
    worker_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    transaction_type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    payment_method_display = serializers.CharField(source='get_payment_method_display', read_only=True)
    paid_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    remaining_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)

    class Meta:
        model = WorkerTransaction
        fields = [
            'id', 'worker', 'worker_name', 'transaction_type', 'transaction_type_display',
            'category', 'category_display', 'related_debt', 'related_sale',
            'amount', 'paid_amount', 'remaining_amount', 'period_month',
            'payment_method', 'payment_method_display',
            'shift', 'cashflow', 'note', 'created_by', 'created_by_name', 'created_at'
        ]
        read_only_fields = ['cashflow', 'created_by', 'shift']

    def validate(self, data):
        related_debt = data.get('related_debt')
        amount = Decimal(str(data.get('amount') or 0))
        trans_type = data.get('transaction_type')

        if related_debt and trans_type == 'WORKER_PAYMENT':
            rem = related_debt.remaining_amount
            # If updating an existing repayment, adjust remaining
            if self.instance and self.instance.related_debt == related_debt:
                rem += self.instance.amount
            if amount > rem:
                raise serializers.ValidationError({
                    "amount": f"To'lov summasi qarz qoldig'idan ({float(rem):,.0f} so'm) oshib ketmasligi kerak."
                })

        related_sale = data.get('related_sale')
        if related_sale and trans_type == 'WORKER_PAYMENT':
            if amount > related_sale.debt_amount:
                raise serializers.ValidationError({
                    "amount": f"To'lov summasi tovar qarzi qoldig'idan ({float(related_sale.debt_amount):,.0f} so'm) oshib ketmasligi kerak."
                })

        return data

    def get_worker_name(self, obj):
        if obj.worker:
            return obj.worker.get_full_name() or obj.worker.username or obj.worker.phone_number
        return ""

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ""


class ClientTransactionSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    transaction_type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)
    payment_method_display = serializers.CharField(source='get_payment_method_display', read_only=True)
    sale_id = serializers.IntegerField(source='sale.id', read_only=True, allow_null=True)

    class Meta:
        model = ClientTransaction
        fields = [
            'id', 'client', 'client_name', 'sale', 'sale_id',
            'transaction_type', 'transaction_type_display',
            'amount', 'payment_method', 'payment_method_display',
            'shift', 'cashflow', 'note', 'created_by', 'created_by_name', 'created_at'
        ]
        read_only_fields = ['cashflow', 'created_by', 'shift']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ""

