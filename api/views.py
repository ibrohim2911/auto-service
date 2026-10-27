from rest_framework import viewsets, filters, status, permissions
from rest_framework.decorators import action
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from .models import (
    User, Category, Unit, PaymentMethod, Product, Inventory, StockTransfer, Client, Car, 
    ProductReceipt, ProductReceiptItem, Sale, SaleItem, Shift, CashFlow, Debt, PrinterSetting,
    CurrencySetting, SaleService, WorkerTransaction
)
from .serializers import (
    UserSerializer, CategorySerializer, UnitSerializer, PaymentMethodSerializer, ProductSerializer, InventorySerializer,
    StockTransferSerializer, ClientSerializer, CarSerializer, ProductReceiptSerializer, ProductReceiptItemSerializer,
    SaleSerializer, SaleItemSerializer, ShiftSerializer, CashFlowSerializer, DebtSerializer, PrinterSettingSerializer,
    CurrencySettingSerializer, SaleServiceSerializer, WorkerTransactionSerializer
)
from .printer_service import (
    list_system_printers, execute_test_print, print_sale_tickets, print_product_barcode,
    get_barcode_label_b64, get_barcode_label_svg
)
from .filters import (
    ProductFilter, SaleFilter, CashFlowFilter, DebtFilter, ProductReceiptFilter, ShiftFilter,
    StockTransferFilter, WorkerTransactionFilter
)
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Sum, Count, F, Q, Value, Subquery, OuterRef, DecimalField
from django.db.models.functions import TruncDate, TruncHour, TruncMonth, Coalesce
from datetime import timedelta, datetime, time
import calendar
from decimal import Decimal
from django.utils import timezone
from rest_framework import status, permissions
from django.contrib.auth import authenticate, login, logout
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from .authentication import CsrfExemptSessionAuthentication
class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('id')
    serializer_class = UserSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['role', 'is_active']
    search_fields = ['username', 'first_name', 'last_name', 'phone_number']
    ordering_fields = ['id', 'username', 'first_name']

@method_decorator(csrf_exempt, name='dispatch')
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        phone_number = request.data.get('phone_number')
        password = request.data.get('password')
        user = authenticate(request, phone_number=phone_number, password=password)
        if user is not None:
            login(request, user)
            return Response({
                "detail": "Successfully logged in.",
                "user": {"id": user.id, "phone_number": user.phone_number, "role": user.role}
            })
        return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)

class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({"detail": "Successfully logged out."})

class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.annotate(products_count=Count('products')).order_by('id')
    serializer_class = CategorySerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['id', 'name', 'created_at', 'products_count']

class UnitViewSet(viewsets.ModelViewSet):
    queryset = Unit.objects.all().order_by('id')
    serializer_class = UnitSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'short_name']
    ordering_fields = ['id', 'name', 'created_at']

class PaymentMethodViewSet(viewsets.ModelViewSet):
    queryset = PaymentMethod.objects.all().order_by('id')
    serializer_class = PaymentMethodSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['id', 'name', 'created_at']

from django.db.models.functions import Coalesce
from django.db.models import DecimalField

class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all().select_related('category', 'unit').annotate(
        total_quantity=Coalesce(Sum('inventory__quantity'), 0.0, output_field=DecimalField())
    )
    serializer_class = ProductSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = ProductFilter
    search_fields = ['name', 'barcode']
    ordering_fields = ['id', 'name', 'cost_price', 'selling_price', 'created_at', 'total_quantity', 'recent_sales_qty']

    def get_queryset(self):
        ten_days_ago = timezone.now() - timedelta(days=10)
        recent_sales = SaleItem.objects.filter(
            product=OuterRef('pk'),
            sale__datetime__gte=ten_days_ago
        ).values('product').annotate(
            sold_qty=Sum('quantity')
        ).values('sold_qty')

        return Product.objects.all().select_related('category', 'unit').annotate(
            total_quantity=Coalesce(Sum('inventory__quantity'), 0.0, output_field=DecimalField()),
            recent_sales_qty=Coalesce(Subquery(recent_sales), 0.0, output_field=DecimalField())
        ).order_by('-recent_sales_qty', '-id')

class InventoryViewSet(viewsets.ModelViewSet):
    queryset = Inventory.objects.all().select_related('product', 'product__category').order_by('id')
    serializer_class = InventorySerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['location', 'product']
    search_fields = ['product__name', 'product__barcode']
    ordering_fields = ['id', 'quantity']

    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        total_products = Product.objects.count()
        total_categories = Category.objects.count()
        total_units = Unit.objects.count()
        
        # Total stock across all inventory locations
        total_stock = Inventory.objects.aggregate(total=Coalesce(Sum('quantity'), 0.0, output_field=DecimalField()))['total']
        store_stock = Inventory.objects.filter(location='STORE').aggregate(total=Coalesce(Sum('quantity'), 0.0, output_field=DecimalField()))['total']
        warehouse_stock = Inventory.objects.filter(location='WAREHOUSE').aggregate(total=Coalesce(Sum('quantity'), 0.0, output_field=DecimalField()))['total']
        
        # Low stock: products whose total inventory across locations < 5
        low_stock_count = Product.objects.annotate(
            tot_qty=Coalesce(Sum('inventory__quantity'), 0.0, output_field=DecimalField())
        ).filter(tot_qty__lt=5).count()
        
        total_transfers = StockTransfer.objects.count()
        
        return Response({
            'total_products': total_products,
            'total_categories': total_categories,
            'total_units': total_units,
            'total_stock': float(total_stock),
            'store_stock': float(store_stock),
            'warehouse_stock': float(warehouse_stock),
            'low_stock': low_stock_count,
            'total_transfers': total_transfers,
        })

    def perform_create(self, serializer):
        instance = serializer.save()
        if float(instance.quantity) > 0:
            user = self.request.user if (self.request.user and self.request.user.is_authenticated) else None
            StockTransfer.objects.create(
                product=instance.product,
                from_location='EXTERNAL',
                to_location=instance.location,
                quantity=instance.quantity,
                user=user,
                note="Boshlang'ich qoldiq kiritildi"
            )

class StockTransferViewSet(viewsets.ModelViewSet):
    queryset = StockTransfer.objects.all().select_related('product', 'product__unit', 'user').order_by('-id')
    serializer_class = StockTransferSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = StockTransferFilter
    search_fields = ['product__name', 'product__barcode', 'user__first_name', 'user__username', 'note']
    ordering_fields = ['id', 'created_at', 'quantity']

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        product = serializer.validated_data['product']
        from_loc = serializer.validated_data['from_location']
        to_loc = serializer.validated_data['to_location']
        qty = serializer.validated_data['quantity']
        
        if from_loc == to_loc:
            return Response(
                {"error": "Chiqish va kirish joylashuvlari bir xil bo'lishi mumkin emas."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        if qty <= 0:
            return Response(
                {"error": "O'tkazish miqdori 0 dan katta bo'lishi kerak."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        with transaction.atomic():
            if from_loc == 'EXTERNAL':
                # Incoming stock / arrival from external source
                to_inv, _ = Inventory.objects.select_for_update().get_or_create(
                    product=product,
                    location=to_loc,
                    defaults={'quantity': 0.0}
                )
                to_inv.quantity = float(to_inv.quantity) + float(qty)
                to_inv.save()
            else:
                # Internal transfer between WAREHOUSE and STORE
                from_inv = Inventory.objects.select_for_update().filter(product=product, location=from_loc).first()
                current_qty = float(from_inv.quantity) if from_inv else 0.0
                transfer_qty = float(qty)
                
                if not from_inv or current_qty < transfer_qty:
                    loc_name = "Sklad" if from_loc == 'WAREHOUSE' else "Magazin"
                    return Response(
                        {"error": f"{loc_name}da yetarli mahsulot qoldig'i mavjud emas! Mavjud: {current_qty}"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                    
                from_inv.quantity = current_qty - transfer_qty
                from_inv.save()
                
                to_inv, _ = Inventory.objects.select_for_update().get_or_create(
                    product=product,
                    location=to_loc,
                    defaults={'quantity': 0.0}
                )
                to_inv.quantity = float(to_inv.quantity) + transfer_qty
                to_inv.save()
            
            user = request.user if (request.user and request.user.is_authenticated) else None
            transfer = serializer.save(user=user)
            
        headers = self.get_success_headers(serializer.data)
        return Response(StockTransferSerializer(transfer).data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_destroy(self, instance):
        with transaction.atomic():
            to_inv = Inventory.objects.select_for_update().filter(product=instance.product, location=instance.to_location).first()
            if instance.from_location == 'EXTERNAL':
                # Revert incoming stock addition if destination still has sufficient stock
                if to_inv and float(to_inv.quantity) >= float(instance.quantity):
                    to_inv.quantity = float(to_inv.quantity) - float(instance.quantity)
                    to_inv.save()
            else:
                # Revert internal transfer
                from_inv, _ = Inventory.objects.select_for_update().get_or_create(
                    product=instance.product, 
                    location=instance.from_location, 
                    defaults={'quantity': 0.0}
                )
                if to_inv and float(to_inv.quantity) >= float(instance.quantity):
                    to_inv.quantity = float(to_inv.quantity) - float(instance.quantity)
                    to_inv.save()
                    from_inv.quantity = float(from_inv.quantity) + float(instance.quantity)
                    from_inv.save()
            instance.delete()

class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.all().order_by('id')
    serializer_class = ClientSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_company']
    search_fields = ['name', 'phone_number', 'account_number']
    ordering_fields = ['id', 'name', 'balance', 'created_at']

    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        total_clients = Client.objects.count()
        total_cars = Car.objects.count()
        company_clients = Client.objects.filter(is_company=True).count()
        person_clients = Client.objects.filter(is_company=False).count()
        return Response({
            'total_clients': total_clients,
            'total_cars': total_cars,
            'company_clients': company_clients,
            'person_clients': person_clients,
        })

    @action(detail=False, methods=['post'], url_path='get-or-create-for-worker')
    def get_or_create_for_worker(self, request):
        worker_id = request.data.get('worker_id')
        if not worker_id:
            return Response({"error": "worker_id talab qilinadi"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            worker = User.objects.get(id=worker_id)
        except User.DoesNotExist:
            return Response({"error": "Usta topilmadi"}, status=status.HTTP_404_NOT_FOUND)

        client = Client.objects.filter(worker=worker).first()
        if not client and worker.phone_number:
            client = Client.objects.filter(phone_number=worker.phone_number).first()
            if client:
                client.worker = worker
                client.save()

        if not client:
            worker_name = worker.get_full_name() or worker.username
            client = Client.objects.create(
                name=f"[Usta] {worker_name}",
                phone_number=worker.phone_number,
                worker=worker,
                is_company=False
            )

        return Response(ClientSerializer(client).data)

class CarViewSet(viewsets.ModelViewSet):
    queryset = Car.objects.all().select_related('owner').order_by('id')
    serializer_class = CarSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['owner']
    search_fields = ['plate_number', 'car_type', 'owner__name']
    ordering_fields = ['id', 'plate_number', 'created_at']

class ProductReceiptViewSet(viewsets.ModelViewSet):
    queryset = ProductReceipt.objects.all().select_related('user').prefetch_related('items').order_by('-date')
    serializer_class = ProductReceiptSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = ProductReceiptFilter
    search_fields = ['user__username', 'user__first_name']
    ordering_fields = ['id', 'date', 'total_cost', 'created_at']

    def perform_create(self, serializer):
        user = self.request.user if (self.request.user and self.request.user.is_authenticated) else None
        serializer.save(user=user)

class ProductReceiptItemViewSet(viewsets.ModelViewSet):
    queryset = ProductReceiptItem.objects.all().select_related('receipt', 'product').order_by('id')
    serializer_class = ProductReceiptItemSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['receipt', 'product', 'destination']
    search_fields = ['product__name']
    ordering_fields = ['id', 'quantity', 'cost_price', 'total_value']

@method_decorator(csrf_exempt, name='dispatch')
class SaleViewSet(viewsets.ModelViewSet):
    authentication_classes = [CsrfExemptSessionAuthentication]
    queryset = Sale.objects.all().select_related('client', 'user', 'car', 'payment_type').prefetch_related('items', 'items__product', 'services', 'services__worker').order_by('-datetime')
    serializer_class = SaleSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = SaleFilter
    search_fields = ['client__name', 'user__username', 'user__first_name', 'car__plate_number']
    ordering_fields = ['id', 'datetime', 'total_amount', 'paid_amount', 'debt_amount', 'due_date']

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sale = serializer.save()
        
        # Check print options
        should_print = request.data.get('print', True)
        print_type = request.data.get('print_type', 'both')  # 'both', 'cashier', 'worker'
        print_results = {}
        if should_print:
            try:
                print_results = print_sale_tickets(sale, target=print_type)
            except Exception as e:
                print_results = {'error': str(e)}

        headers = self.get_success_headers(serializer.data)
        response_data = serializer.data
        response_data['print_results'] = print_results
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=['post'], url_path='print')
    def print_ticket(self, request, pk=None):
        sale = self.get_object()
        target = request.data.get('type', 'both')  # 'both', 'cashier', or 'worker'
        results = print_sale_tickets(sale, target=target)
        return Response({
            "detail": "Chop etish vazifasi yuborildi",
            "results": results
        })

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        sale = self.get_object()
        sale_id = sale.id

        # 1. Revert inventory and FIFO batches for all items
        for item in sale.items.all():
            qty = Decimal(str(item.quantity))
            inv = Inventory.objects.filter(product_id=item.product_id, location='STORE').first() or \
                  Inventory.objects.filter(product_id=item.product_id, location='WAREHOUSE').first()
            if inv:
                inv.quantity = Decimal(str(inv.quantity)) + qty
                inv.save()
            
            latest_batch = ProductReceiptItem.objects.filter(product_id=item.product_id).order_by('-id').first()
            if latest_batch:
                latest_batch.remaining_quantity = Decimal(str(latest_batch.remaining_quantity)) + qty
                latest_batch.save()

        # 2. Delete linked debts
        sale.debts.all().delete()

        # 3. Delete linked cashflows
        sale.payments.all().delete()

        # 4. Delete the sale
        sale.delete()
        return Response({"detail": f"Sotuv #{sale_id} muvaffaqiyatli o'chirildi va qoldiqlar qaytarildi."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='refund')
    @transaction.atomic
    def refund(self, request, pk=None):
        sale = self.get_object()
        items_to_refund = request.data.get('items', None)
        services_to_refund = request.data.get('services', None)
        full_refund = request.data.get('full_refund', False)
        reason = request.data.get('reason', 'Mijoz qaytardi')
        payment_method_id = request.data.get('payment_method')

        if full_refund or (items_to_refund is None and services_to_refund is None):
            items_to_refund = [{'id': item.id, 'quantity': float(item.quantity)} for item in sale.items.all()]
            services_to_refund = [s.id for s in sale.services.all()]

        refund_total = Decimal('0.00')

        # 1. Refund items
        if items_to_refund:
            for ref_item in items_to_refund:
                item_id = ref_item.get('id')
                ref_qty = Decimal(str(ref_item.get('quantity', 0)))
                if ref_qty <= 0:
                    continue
                try:
                    item = sale.items.get(id=item_id)
                except SaleItem.DoesNotExist:
                    continue
                
                actual_qty = min(Decimal(str(item.quantity)), ref_qty)
                item_refund_val = actual_qty * Decimal(str(item.price))
                refund_total += item_refund_val

                # Revert inventory
                inv = Inventory.objects.filter(product_id=item.product_id, location='STORE').first() or \
                      Inventory.objects.filter(product_id=item.product_id, location='WAREHOUSE').first()
                if inv:
                    inv.quantity = Decimal(str(inv.quantity)) + actual_qty
                    inv.save()

                latest_batch = ProductReceiptItem.objects.filter(product_id=item.product_id).order_by('-id').first()
                if latest_batch:
                    latest_batch.remaining_quantity = Decimal(str(latest_batch.remaining_quantity)) + actual_qty
                    latest_batch.save()

                new_qty = Decimal(str(item.quantity)) - actual_qty
                if new_qty <= Decimal('0.001'):
                    item.delete()
                else:
                    item.quantity = new_qty
                    item.total = new_qty * Decimal(str(item.price))
                    item.save()

        # 2. Refund services
        if services_to_refund:
            for s_id in services_to_refund:
                try:
                    svc = sale.services.get(id=s_id)
                    refund_total += Decimal(str(svc.amount))
                    svc.delete()
                except SaleService.DoesNotExist:
                    continue

        if refund_total <= 0:
            return Response({"detail": "Qaytarish uchun mahsulot yoki xizmat tanlanmadi."}, status=status.HTTP_400_BAD_REQUEST)

        # 3. Accounting adjustment: Debt vs Cash refund
        current_debt = Decimal(str(sale.debt_amount))
        debt_reduction = min(current_debt, refund_total)
        cash_refund = refund_total - debt_reduction

        new_total = max(Decimal('0.00'), Decimal(str(sale.total_amount)) - refund_total)
        new_debt = max(Decimal('0.00'), current_debt - debt_reduction)
        new_paid = max(Decimal('0.00'), Decimal(str(sale.paid_amount)) - cash_refund)

        sale.total_amount = new_total
        sale.debt_amount = new_debt
        sale.paid_amount = new_paid
        sale.save()

        # Update linked Debt
        linked_debt = Debt.objects.filter(sale=sale).first()
        if linked_debt:
            if new_debt <= 0:
                linked_debt.status = 'PAID'
                linked_debt.paid_amount = linked_debt.amount
                linked_debt.save()
            else:
                linked_debt.amount = new_debt
                linked_debt.save()

        # Create CashFlow expense for cash returned
        if cash_refund > 0:
            payment_method = None
            if payment_method_id:
                payment_method = PaymentMethod.objects.filter(id=payment_method_id).first()
            if not payment_method:
                payment_method = sale.payment_type

            active_shift = None
            if request.user and request.user.is_authenticated:
                active_shift = Shift.objects.filter(user=request.user, status='OPEN').first()
            if not active_shift:
                active_shift = sale.shift

            CashFlow.objects.create(
                transaction_type='EXPENSE',
                category='SALE',
                amount=cash_refund,
                payment_method=payment_method,
                shift=active_shift,
                client=sale.client,
                user=request.user if (request.user and request.user.is_authenticated) else sale.user,
                sale=sale,
                description=f"Qaytarish (Vozvrat) Sotuv #{sale.id}: {reason}"
            )

        serializer = self.get_serializer(sale)
        return Response({
            "detail": f"Sotuv #{sale.id} bo'yicha {float(refund_total):,.0f} so'm qaytarildi.",
            "refund_amount": float(refund_total),
            "cash_refund": float(cash_refund),
            "debt_reduction": float(debt_reduction),
            "sale": serializer.data
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='pay-debt')
    @transaction.atomic
    def pay_debt(self, request, pk=None):
        sale = self.get_object()
        amount = Decimal(str(request.data.get('amount', 0)))
        payment_method_id = request.data.get('payment_method')
        note = request.data.get('note', '')

        if amount <= 0:
            return Response({"detail": "To'lov summasi 0 dan katta bo'lishi kerak."}, status=status.HTTP_400_BAD_REQUEST)
        if amount > sale.debt_amount:
            return Response({"detail": f"To'lov summasi qarz miqdoridan ({float(sale.debt_amount):,.0f} so'm) ko'p bo'lishi mumkin emas."}, status=status.HTTP_400_BAD_REQUEST)

        payment_method = None
        if payment_method_id:
            payment_method = PaymentMethod.objects.filter(id=payment_method_id).first()
        if not payment_method:
            payment_method = sale.payment_type or PaymentMethod.objects.first()
        
        # 1. Update Sale
        sale.debt_amount = max(Decimal('0.00'), sale.debt_amount - amount)
        sale.paid_amount = min(sale.total_amount, sale.paid_amount + amount)
        sale.save(update_fields=['debt_amount', 'paid_amount'])

        # 2. Update linked Debt object if exists
        linked_debt = sale.debts.first()
        if linked_debt:
            linked_debt.paid_amount = min(linked_debt.amount, Decimal(str(linked_debt.paid_amount)) + amount)
            linked_debt.status = 'PAID' if linked_debt.paid_amount >= linked_debt.amount else 'PARTIAL'
            linked_debt.save(update_fields=['paid_amount', 'status'])

        # 3. Create CashFlow income record
        active_shift = None
        if request.user and request.user.is_authenticated:
            active_shift = Shift.objects.filter(user=request.user, status='OPEN').first()
        if not active_shift:
            active_shift = sale.shift

        CashFlow.objects.create(
            transaction_type='INCOME',
            category='DEBT',
            amount=amount,
            payment_method=payment_method,
            shift=active_shift,
            client=sale.client,
            user=request.user if (request.user and request.user.is_authenticated) else sale.user,
            sale=sale,
            description=note or f"Nasiya qarz to'lovi (Sotuv #{sale.id})"
        )

        return Response({
            "detail": f"Sotuv #{sale.id} bo'yicha {float(amount):,.0f} so'm qarz muvaffaqiyatli to'landi.",
            "sale_id": sale.id,
            "remaining_debt": float(sale.debt_amount),
            "paid_amount": float(sale.paid_amount)
        }, status=status.HTTP_200_OK)

class SaleItemViewSet(viewsets.ModelViewSet):
    queryset = SaleItem.objects.all().select_related('sale', 'product').order_by('id')
    serializer_class = SaleItemSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['sale', 'product']
    search_fields = ['product__name']
    ordering_fields = ['id', 'quantity', 'price', 'total']

@method_decorator(csrf_exempt, name='dispatch')
class ShiftViewSet(viewsets.ModelViewSet):
    authentication_classes = [CsrfExemptSessionAuthentication]
    queryset = Shift.objects.all().select_related('user').order_by('-opened_at')
    serializer_class = ShiftSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = ShiftFilter
    search_fields = ['=id', 'user__username', 'user__first_name', 'user__last_name', 'notes']
    ordering_fields = ['id', 'opened_at', 'closed_at', 'starting_cash', 'expected_cash', 'actual_cash', 'difference']

    def perform_create(self, serializer):
        user = self.request.user if (self.request.user and self.request.user.is_authenticated) else serializer.validated_data.get('user')
        if not user:
            user = User.objects.first()
        
        # Ensure no open shift for user
        active = Shift.objects.filter(user=user, status='OPEN').first()
        if active:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": f"Ushbu xodim uchun smena allaqachon ochiq (Shift #{active.id}). Avval uni yoping."})

        starting_cash = serializer.validated_data.get('starting_cash', Decimal('0.00'))
        serializer.save(
            user=user,
            starting_cash=starting_cash,
            expected_cash=starting_cash,
            actual_cash=Decimal('0.00'),
            difference=Decimal('0.00'),
            status='OPEN'
        )

    @action(detail=False, methods=['get'])
    def current(self, request):
        user_id = request.query_params.get('user')
        if user_id:
            shift = Shift.objects.filter(user_id=user_id, status='OPEN').first()
        elif request.user and request.user.is_authenticated:
            shift = Shift.objects.filter(user=request.user, status='OPEN').first()
        else:
            shift = Shift.objects.filter(status='OPEN').order_by('-opened_at').first()

        if not shift:
            return Response({"active": False, "shift": None})

        serializer = self.get_serializer(shift)
        return Response({"active": True, "shift": serializer.data})

    @action(detail=False, methods=['post'], url_path='start')
    def start_shift(self, request):
        user_id = request.data.get('user')
        if user_id:
            user = User.objects.filter(id=user_id).first()
        elif request.user and request.user.is_authenticated:
            user = request.user
        else:
            user = User.objects.first()

        if not user:
            return Response({"detail": "Foydalanuvchi topilmadi."}, status=status.HTTP_400_BAD_REQUEST)

        # Check existing open shift
        active = Shift.objects.filter(user=user, status='OPEN').first()
        if active:
            return Response({
                "detail": f"Sizda allaqachon ochiq smena mavjud (Shift #{active.id}). Avval joriy smenani yoping.",
                "shift": self.get_serializer(active).data
            }, status=status.HTTP_400_BAD_REQUEST)

        starting_cash = Decimal(str(request.data.get('starting_cash', 0) or 0))
        shift = Shift.objects.create(
            user=user,
            starting_cash=starting_cash,
            expected_cash=starting_cash,
            actual_cash=Decimal('0.00'),
            difference=Decimal('0.00'),
            status='OPEN',
            notes=request.data.get('notes', '')
        )
        return Response(self.get_serializer(shift).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='close')
    def close_shift(self, request, pk=None):
        shift = self.get_object()
        if shift.status == 'CLOSED':
            return Response({"detail": "Ushbu smena allaqachon yopilgan."}, status=status.HTTP_400_BAD_REQUEST)

        from .shift_service import calculate_shift_summary
        summary = calculate_shift_summary(shift)
        expected_cash = Decimal(str(summary['expected_cash']))
        actual_cash = Decimal(str(request.data.get('actual_cash', 0) or 0))
        difference = actual_cash - expected_cash

        shift.expected_cash = expected_cash
        shift.actual_cash = actual_cash
        shift.difference = difference
        shift.status = 'CLOSED'
        shift.closed_at = timezone.now()
        if 'notes' in request.data:
            shift.notes = request.data.get('notes')
        shift.save()

        return Response(self.get_serializer(shift).data)

    @action(detail=False, methods=['post'], url_path='close_current')
    def close_current(self, request):
        user_id = request.data.get('user')
        if user_id:
            shift = Shift.objects.filter(user_id=user_id, status='OPEN').first()
        elif request.user and request.user.is_authenticated:
            shift = Shift.objects.filter(user=request.user, status='OPEN').first()
        else:
            shift = Shift.objects.filter(status='OPEN').order_by('-opened_at').first()

        if not shift:
            return Response({"detail": "Hozirda yopish uchun ochiq smena topilmadi."}, status=status.HTTP_404_NOT_FOUND)

        from .shift_service import calculate_shift_summary
        summary = calculate_shift_summary(shift)
        expected_cash = Decimal(str(summary['expected_cash']))
        actual_cash = Decimal(str(request.data.get('actual_cash', 0) or 0))
        difference = actual_cash - expected_cash

        shift.expected_cash = expected_cash
        shift.actual_cash = actual_cash
        shift.difference = difference
        shift.status = 'CLOSED'
        shift.closed_at = timezone.now()
        if 'notes' in request.data:
            shift.notes = request.data.get('notes')
        shift.save()

        return Response(self.get_serializer(shift).data)

    @action(detail=True, methods=['get'], url_path='summary')
    def summary(self, request, pk=None):
        shift = self.get_object()
        from .shift_service import calculate_shift_summary
        summary_data = calculate_shift_summary(shift)
        return Response(summary_data)

class CashFlowViewSet(viewsets.ModelViewSet):
    queryset = CashFlow.objects.all().select_related('client', 'user', 'sale', 'payment_method').order_by('-datetime')
    serializer_class = CashFlowSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = CashFlowFilter
    search_fields = ['description', 'client__name', 'user__username']
    ordering_fields = ['id', 'datetime', 'amount', 'category', 'transaction_type', 'payment_method__name', 'client__name']

    def perform_create(self, serializer):
        user = self.request.user if (self.request.user and self.request.user.is_authenticated) else serializer.validated_data.get('user')
        active_shift = None
        if user:
            active_shift = Shift.objects.filter(user=user, status='OPEN').first()
        serializer.save(user=user, shift=active_shift)

class DebtViewSet(viewsets.ModelViewSet):
    queryset = Debt.objects.all().select_related('client', 'sale').order_by('-created_at')
    serializer_class = DebtSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = DebtFilter
    search_fields = ['person_name', 'client__name', 'description']
    ordering_fields = ['id', 'amount', 'due_date', 'created_at']

    def perform_create(self, serializer):
        due_date = serializer.validated_data.get('due_date')
        if not due_date:
            due_date = timezone.now().date() + timedelta(days=7)
        serializer.save(due_date=due_date)

    def perform_update(self, serializer):
        debt = serializer.save()
        if debt.sale:
            sale = debt.sale
            remaining_debt = max(0.0, float(debt.amount) - float(debt.paid_amount))
            sale.debt_amount = remaining_debt
            sale.paid_amount = max(0.0, float(sale.total_amount) - remaining_debt)
            if debt.due_date:
                sale.due_date = debt.due_date
            sale.save(update_fields=['debt_amount', 'paid_amount', 'due_date'])

def parse_dashboard_time_filter(request):
    """
    Parses period/date_from/date_to parameters and returns:
    (start_dt, end_dt, period_key, period_label, grouping_type)
    where grouping_type is 'hour', 'day', or 'month'.
    """
    now = timezone.now()
    today = timezone.localdate()
    current_tz = timezone.get_current_timezone()

    shift_id = request.query_params.get('shift', '').strip() or request.query_params.get('shift_id', '').strip()
    if shift_id:
        try:
            shift = Shift.objects.filter(id=shift_id).select_related('user').first()
            if shift:
                start_dt = shift.opened_at
                end_dt = shift.closed_at or timezone.now()
                user_label = shift.user.get_full_name() or shift.user.username
                status_label = "Ochiq" if shift.status == 'OPEN' else "Yopiq"
                period_label = f"Smena #{shift.id} • {user_label} ({status_label})"
                return start_dt, end_dt, 'shift', period_label, 'hour'
        except Exception:
            pass

    period = request.query_params.get('period', '').lower().strip()
    date_from_str = request.query_params.get('date_from', '').strip()
    date_to_str = request.query_params.get('date_to', '').strip()

    if date_from_str and date_to_str:
        try:
            d_from = datetime.strptime(date_from_str, '%Y-%m-%d').date()
            d_to = datetime.strptime(date_to_str, '%Y-%m-%d').date()
            start_dt = timezone.make_aware(datetime.combine(d_from, time.min), current_tz)
            end_dt = timezone.make_aware(datetime.combine(d_to, time.max), current_tz)
            days_diff = (d_to - d_from).days
            if days_diff <= 1:
                grouping = 'hour'
            elif days_diff <= 45:
                grouping = 'day'
            else:
                grouping = 'month'
            return start_dt, end_dt, 'custom', f"{d_from.strftime('%d.%m.%Y')} - {d_to.strftime('%d.%m.%Y')}", grouping
        except Exception:
            pass

    if period == 'today':
        start_dt = timezone.make_aware(datetime.combine(today, time.min), current_tz)
        end_dt = timezone.make_aware(datetime.combine(today, time.max), current_tz)
        return start_dt, end_dt, 'today', "Bugun", 'hour'

    elif period == 'yesterday':
        yesterday = today - timedelta(days=1)
        start_dt = timezone.make_aware(datetime.combine(yesterday, time.min), current_tz)
        end_dt = timezone.make_aware(datetime.combine(yesterday, time.max), current_tz)
        return start_dt, end_dt, 'yesterday', "Kecha", 'hour'

    elif period == '7days':
        d_from = today - timedelta(days=6)
        start_dt = timezone.make_aware(datetime.combine(d_from, time.min), current_tz)
        end_dt = timezone.make_aware(datetime.combine(today, time.max), current_tz)
        return start_dt, end_dt, '7days', "Oxirgi 7 kun", 'day'

    elif period == 'last_month':
        first_of_this_month = today.replace(day=1)
        last_of_prev_month = first_of_this_month - timedelta(days=1)
        first_of_prev_month = last_of_prev_month.replace(day=1)
        start_dt = timezone.make_aware(datetime.combine(first_of_prev_month, time.min), current_tz)
        end_dt = timezone.make_aware(datetime.combine(last_of_prev_month, time.max), current_tz)
        return start_dt, end_dt, 'last_month', f"O'tgan oy ({first_of_prev_month.strftime('%Y-%m')})", 'day'

    elif period == 'all_time':
        earliest_sale = Sale.objects.order_by('datetime').first()
        earliest_dt = earliest_sale.datetime if earliest_sale else (now - timedelta(days=365))
        d_from = timezone.localdate(earliest_dt)
        start_dt = timezone.make_aware(datetime.combine(d_from, time.min), current_tz)
        end_dt = timezone.make_aware(datetime.combine(today, time.max), current_tz)
        days_diff = (today - d_from).days
        grouping = 'month' if days_diff > 45 else 'day'
        return start_dt, end_dt, 'all_time', "Barcha davr", grouping

    else:
        # Default: 'this_month'
        first_day = today.replace(day=1)
        _, last_day_num = calendar.monthrange(today.year, today.month)
        last_day = today.replace(day=last_day_num)
        start_dt = timezone.make_aware(datetime.combine(first_day, time.min), current_tz)
        end_dt = timezone.make_aware(datetime.combine(last_day, time.max), current_tz)
        return start_dt, end_dt, 'this_month', f"Shu oy ({today.strftime('%Y-%m')})", 'day'


@method_decorator(csrf_exempt, name='dispatch')
class DashboardStatsView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]

    def get(self, request):
        now = timezone.now()
        today = timezone.localdate()
        current_tz = timezone.get_current_timezone()

        # 1. Parse time filters
        start_dt, end_dt, period_key, period_label, grouping = parse_dashboard_time_filter(request)

        shift_id = request.query_params.get('shift', '').strip() or request.query_params.get('shift_id', '').strip()
        selected_shift = None
        if shift_id:
            try:
                selected_shift = Shift.objects.filter(id=shift_id).select_related('user').first()
            except Exception:
                selected_shift = None

        # 2. Filtered QuerySets for period
        if selected_shift:
            sales_qs = Sale.objects.filter(Q(shift=selected_shift) | Q(user=selected_shift.user, datetime__gte=start_dt, datetime__lte=end_dt))
            items_qs = SaleItem.objects.filter(sale__in=sales_qs)
            services_qs = SaleService.objects.filter(sale__in=sales_qs)
            expenses_qs = CashFlow.objects.filter(Q(shift=selected_shift) | Q(user=selected_shift.user, datetime__gte=start_dt, datetime__lte=end_dt), transaction_type='EXPENSE')
            tool_fees_qs = WorkerTransaction.objects.filter(transaction_type='TOOL_FEE', created_at__gte=start_dt, created_at__lte=end_dt)
            worker_payments_qs = WorkerTransaction.objects.filter(transaction_type='WORKER_PAYMENT', created_at__gte=start_dt, created_at__lte=end_dt)
        else:
            sales_qs = Sale.objects.filter(datetime__gte=start_dt, datetime__lte=end_dt)
            items_qs = SaleItem.objects.filter(sale__datetime__gte=start_dt, sale__datetime__lte=end_dt)
            services_qs = SaleService.objects.filter(sale__datetime__gte=start_dt, sale__datetime__lte=end_dt)
            expenses_qs = CashFlow.objects.filter(transaction_type='EXPENSE', datetime__gte=start_dt, datetime__lte=end_dt)
            tool_fees_qs = WorkerTransaction.objects.filter(transaction_type='TOOL_FEE', created_at__gte=start_dt, created_at__lte=end_dt)
            worker_payments_qs = WorkerTransaction.objects.filter(transaction_type='WORKER_PAYMENT', created_at__gte=start_dt, created_at__lte=end_dt)

        # 3. Period Sales & Revenue Aggregations
        sales_agg = sales_qs.aggregate(
            total_revenue=Coalesce(Sum('total_amount'), Value(Decimal('0.00'))),
            total_paid=Coalesce(Sum('paid_amount'), Value(Decimal('0.00'))),
            total_debt=Coalesce(Sum('debt_amount'), Value(Decimal('0.00'))),
            total_sales_count=Count('id')
        )
        total_sales_count = sales_agg['total_sales_count']
        company_sales_count = sales_qs.filter(client__is_company=True).count()
        individual_sales_count = total_sales_count - company_sales_count

        items_agg = items_qs.aggregate(
            product_revenue=Coalesce(Sum('total'), Value(Decimal('0.00'))),
            product_cost=Coalesce(Sum('total_cost'), Value(Decimal('0.00'))),
            products_sold_qty=Coalesce(Sum('quantity'), Value(Decimal('0.00'))),
        )

        services_agg = services_qs.aggregate(
            service_revenue=Coalesce(Sum('amount'), Value(Decimal('0.00'))),
            services_count=Count('id')
        )

        tool_fees_agg = tool_fees_qs.aggregate(
            total_tool_fees=Coalesce(Sum('amount'), Value(Decimal('0.00')))
        )

        worker_payments_agg = worker_payments_qs.aggregate(
            total_worker_payments=Coalesce(Sum('amount'), Value(Decimal('0.00')))
        )

        expenses_agg = expenses_qs.aggregate(
            total_expenses=Coalesce(Sum('amount'), Value(Decimal('0.00')))
        )

        total_revenue = sales_agg['total_revenue']
        service_revenue = services_agg['service_revenue']
        product_revenue = max(Decimal('0.00'), total_revenue - service_revenue)
        product_cost = items_agg['product_cost']
        product_profit = max(Decimal('0.00'), product_revenue - product_cost)
        total_tool_fees = tool_fees_agg['total_tool_fees']
        total_worker_payments = worker_payments_agg['total_worker_payments']
        gross_profit = product_profit + service_revenue + total_worker_payments
        total_expenses = expenses_agg['total_expenses']
        net_profit = gross_profit - total_expenses

        # 4. Payment Channels Breakdown in Period (groups all sales across 4 standard types)
        cash_total = Decimal('0.00')
        card_total = Decimal('0.00')
        transfer_total = Decimal('0.00')
        debt_total = Decimal('0.00')

        for s in sales_qs.select_related('payment_type'):
            s_total = Decimal(str(s.total_amount or 0))
            s_paid = Decimal(str(s.paid_amount or 0))
            s_debt = Decimal(str(s.debt_amount or 0))

            if s_paid == 0 and s_debt == 0 and s_total > 0:
                pt_name = (s.payment_type.name if s.payment_type else '').lower()
                if 'qarz' in pt_name:
                    s_debt = s_total
                else:
                    s_paid = s_total

            if s_debt > 0:
                debt_total += s_debt
            if s_paid > 0:
                pt_name = (s.payment_type.name if s.payment_type else '').lower()
                if any(k in pt_name for k in ['kart', 'plastik', 'card']):
                    card_total += s_paid
                elif any(k in pt_name for k in ['hisob', "o'tkazma", 'otkazma', 'transfer']):
                    transfer_total += s_paid
                else:
                    cash_total += s_paid

        payment_breakdown = [
            {'key': 'CASH', 'name': 'Naqd pul', 'short_name': 'Naqd', 'value': float(cash_total), 'type': 'PAID'},
            {'key': 'CARD', 'name': 'Plastik karta', 'short_name': 'Plastik', 'value': float(card_total), 'type': 'PAID'},
            {'key': 'TRANSFER', 'name': 'Hisob raqam', 'short_name': 'Hisob', 'value': float(transfer_total), 'type': 'PAID'},
            {'key': 'DEBT', 'name': 'Qarzga sotilgan', 'short_name': 'Qarz', 'value': float(debt_total), 'type': 'DEBT'},
        ]

        # 5. Live Balances & Debts Snapshot (Global current active state)
        debts_given_unpaid = Debt.objects.filter(debt_type='GIVEN').aggregate(
            unpaid=Coalesce(Sum('amount') - Sum('paid_amount'), Value(Decimal('0.00')))
        )['unpaid']
        debts_given_company = Debt.objects.filter(debt_type='GIVEN', client__is_company=True).aggregate(
            unpaid=Coalesce(Sum('amount') - Sum('paid_amount'), Value(Decimal('0.00')))
        )['unpaid']
        individual_debts_total = max(Decimal('0.00'), debts_given_unpaid - debts_given_company)

        debts_taken_unpaid = Debt.objects.filter(debt_type='TAKEN').aggregate(
            unpaid=Coalesce(Sum('amount') - Sum('paid_amount'), Value(Decimal('0.00')))
        )['unpaid']

        # Worker Tab balances (Live)
        workers = User.objects.filter(role='WORKER', is_active=True)
        workers_payable_balance = Decimal('0.00')
        workers_debt_balance = Decimal('0.00')
        workers_total_advances = Decimal('0.00')
        for w in workers:
            w_services = SaleService.objects.filter(worker=w).select_related('sale')
            w_paid_services = Decimal('0.00')
            for s in w_services:
                sale = s.sale
                if sale.total_amount and sale.total_amount > 0:
                    ratio = min(Decimal('1.0'), max(Decimal('0.0'), Decimal(str(sale.paid_amount)) / Decimal(str(sale.total_amount))))
                else:
                    ratio = Decimal('1.0')
                w_paid_services += Decimal(str(s.amount)) * ratio
            
            w_trans = WorkerTransaction.objects.filter(worker=w)
            w_tool_fees = sum((t.amount for t in w_trans if t.transaction_type == 'TOOL_FEE'), Decimal('0.00'))
            w_debts = sum((t.amount for t in w_trans if t.transaction_type == 'WORKER_DEBT'), Decimal('0.00'))
            w_payouts = sum((t.amount for t in w_trans if t.transaction_type == 'PAYOUT'), Decimal('0.00'))
            w_bonuses = sum((t.amount for t in w_trans if t.transaction_type == 'BONUS'), Decimal('0.00'))
            w_worker_payments = sum((t.amount for t in w_trans if t.transaction_type == 'WORKER_PAYMENT'), Decimal('0.00'))
            
            workers_total_advances += w_debts
            net_payable = w_paid_services + w_bonuses + w_worker_payments - w_tool_fees - w_debts - w_payouts
            if net_payable > 0:
                workers_payable_balance += net_payable
            elif net_payable < 0:
                workers_debt_balance += abs(net_payable)

        # Inventory Summary (Live)
        total_items_count = Product.objects.count()
        inv_agg = Inventory.objects.aggregate(
            total_stock_qty=Coalesce(Sum('quantity'), Value(Decimal('0.00'))),
            total_cost_val=Coalesce(Sum(F('quantity') * F('product__cost_price')), Value(Decimal('0.00'))),
            total_sell_val=Coalesce(Sum(F('quantity') * F('product__selling_price')), Value(Decimal('0.00'))),
        )
        low_stock_count = Product.objects.filter(inventory__quantity__lte=5).distinct().count()
        low_stock_qs = Inventory.objects.filter(quantity__lte=5).select_related('product', 'product__unit').order_by('quantity')[:6]
        low_stock_products = []
        for inv in low_stock_qs:
            low_stock_products.append({
                'product_id': inv.product.id,
                'name': inv.product.name,
                'barcode': inv.product.barcode,
                'quantity': float(inv.quantity),
                'location': inv.get_location_display(),
                'unit': inv.product.unit.name if inv.product.unit else 'dona'
            })

        # 6. Time-Series Trend Chart Data
        chart_data = []
        if grouping == 'hour':
            hours_data = {h: {'name': f"{h:02d}:00", 'date': f"{h:02d}:00", 'Revenue': 0.0, 'total_revenue': 0.0, 'product_revenue': 0.0, 'service_revenue': 0.0, 'profit': 0.0, 'expenses': 0.0} for h in range(24)}
            for sale in sales_qs.prefetch_related('items', 'services'):
                local_h = sale.datetime.astimezone(current_tz).hour
                hours_data[local_h]['Revenue'] += float(sale.total_amount)
                hours_data[local_h]['total_revenue'] += float(sale.total_amount)
                s_rev = sum(float(svc.amount) for svc in sale.services.all())
                p_rev = max(0.0, float(sale.total_amount) - s_rev)
                p_cost = sum(float(it.total_cost) for it in sale.items.all())
                hours_data[local_h]['product_revenue'] += p_rev
                hours_data[local_h]['service_revenue'] += s_rev
                hours_data[local_h]['profit'] += max(0.0, p_rev - p_cost) + s_rev

            for exp in expenses_qs:
                local_h = exp.datetime.astimezone(current_tz).hour
                hours_data[local_h]['expenses'] += float(exp.amount)

            chart_data = [v for k, v in sorted(hours_data.items()) if (8 <= k <= 21) or v['total_revenue'] > 0 or v['expenses'] > 0]
            if not chart_data:
                chart_data = [hours_data[h] for h in range(8, 21)]

        elif grouping == 'day':
            days_data = {}
            curr = start_dt.date()
            end_d = min(today, end_dt.date())
            while curr <= end_d:
                d_key = curr.strftime('%Y-%m-%d')
                disp_name = curr.strftime('%d-%b')
                days_data[d_key] = {
                    'name': disp_name,
                    'date': d_key,
                    'Revenue': 0.0,
                    'total_revenue': 0.0,
                    'product_revenue': 0.0,
                    'service_revenue': 0.0,
                    'profit': 0.0,
                    'expenses': 0.0
                }
                curr += timedelta(days=1)

            for sale in sales_qs.prefetch_related('items', 'services'):
                d_key = sale.datetime.astimezone(current_tz).strftime('%Y-%m-%d')
                if d_key in days_data:
                    days_data[d_key]['Revenue'] += float(sale.total_amount)
                    days_data[d_key]['total_revenue'] += float(sale.total_amount)
                    s_rev = sum(float(svc.amount) for svc in sale.services.all())
                    p_rev = max(0.0, float(sale.total_amount) - s_rev)
                    p_cost = sum(float(it.total_cost) for it in sale.items.all())
                    days_data[d_key]['product_revenue'] += p_rev
                    days_data[d_key]['service_revenue'] += s_rev
                    days_data[d_key]['profit'] += max(0.0, p_rev - p_cost) + s_rev

            for exp in expenses_qs:
                d_key = exp.datetime.astimezone(current_tz).strftime('%Y-%m-%d')
                if d_key in days_data:
                    days_data[d_key]['expenses'] += float(exp.amount)

            chart_data = list(days_data.values())

        else: # month
            months_data = {}
            curr = start_dt.replace(day=1).date()
            end_d = end_dt.date()
            while curr <= end_d:
                m_key = curr.strftime('%Y-%m')
                disp_name = curr.strftime('%b %Y')
                months_data[m_key] = {
                    'name': disp_name,
                    'date': m_key,
                    'Revenue': 0.0,
                    'total_revenue': 0.0,
                    'product_revenue': 0.0,
                    'service_revenue': 0.0,
                    'profit': 0.0,
                    'expenses': 0.0
                }
                _, last_num = calendar.monthrange(curr.year, curr.month)
                curr = (curr.replace(day=last_num) + timedelta(days=1))

            for sale in sales_qs.prefetch_related('items', 'services'):
                m_key = sale.datetime.astimezone(current_tz).strftime('%Y-%m')
                if m_key in months_data:
                    months_data[m_key]['Revenue'] += float(sale.total_amount)
                    months_data[m_key]['total_revenue'] += float(sale.total_amount)
                    s_rev = sum(float(svc.amount) for svc in sale.services.all())
                    p_rev = max(0.0, float(sale.total_amount) - s_rev)
                    p_cost = sum(float(it.total_cost) for it in sale.items.all())
                    months_data[m_key]['product_revenue'] += p_rev
                    months_data[m_key]['service_revenue'] += s_rev
                    months_data[m_key]['profit'] += max(0.0, p_rev - p_cost) + s_rev

            for exp in expenses_qs:
                m_key = exp.datetime.astimezone(current_tz).strftime('%Y-%m')
                if m_key in months_data:
                    months_data[m_key]['expenses'] += float(exp.amount)

            chart_data = list(months_data.values())

        # 7. Top Mechanics (Workers) in Period
        top_workers_qs = SaleService.objects.filter(
            sale__datetime__gte=start_dt,
            sale__datetime__lte=end_dt,
            worker__isnull=False
        ).values(
            'worker__id', 'worker__first_name', 'worker__last_name', 'worker__username', 'worker__job', 'worker__phone_number'
        ).annotate(
            total_service_fee=Coalesce(Sum('amount'), Value(Decimal('0.00'))),
            services_count=Count('id'),
            cars_count=Count('sale__car', distinct=True)
        ).order_by('-total_service_fee')[:5]

        top_workers = []
        for tw in top_workers_qs:
            w_name = f"{tw['worker__first_name']} {tw['worker__last_name']}".strip() or tw['worker__username']
            top_workers.append({
                'id': tw['worker__id'],
                'name': w_name,
                'job': tw['worker__job'] or 'Usta',
                'phone': tw['worker__phone_number'],
                'total_fee': float(tw['total_service_fee']),
                'services_count': tw['services_count'],
                'cars_count': tw['cars_count'],
            })

        # 8. Top Products in Period
        top_prods_qs = SaleItem.objects.filter(
            sale__datetime__gte=start_dt,
            sale__datetime__lte=end_dt
        ).values(
            'product__id', 'product__name', 'product__barcode', 'product__unit__name'
        ).annotate(
            total_revenue=Coalesce(Sum('total'), Value(Decimal('0.00'))),
            total_qty=Coalesce(Sum('quantity'), Value(Decimal('0.00')))
        ).order_by('-total_revenue')[:6]

        top_products = []
        for tp in top_prods_qs:
            top_products.append({
                'id': tp['product__id'],
                'name': tp['product__name'],
                'barcode': tp['product__barcode'],
                'unit': tp['product__unit__name'] or 'dona',
                'qty': float(tp['total_qty']),
                'value': float(tp['total_revenue'])
            })

        # Backward compatible category performance
        cat_performance = SaleItem.objects.filter(sale__datetime__gte=start_dt, sale__datetime__lte=end_dt) \
            .values('product__category__name') \
            .annotate(value=Coalesce(Sum('total'), Value(Decimal('0.00')))) \
            .order_by('-value')
        category_performance = [{"name": c['product__category__name'] or 'Toifasiz', "value": float(c['value'])} for c in cat_performance]

        # 9. Recent Sales with Service and Product badges
        recent_sales_qs = Sale.objects.filter(datetime__gte=start_dt, datetime__lte=end_dt) \
            .select_related('client', 'car', 'payment_type') \
            .prefetch_related('items', 'items__product', 'services', 'services__worker') \
            .order_by('-datetime')[:10]

        if not recent_sales_qs.exists():
            recent_sales_qs = Sale.objects.select_related('client', 'car', 'payment_type') \
                .prefetch_related('items', 'items__product', 'services', 'services__worker') \
                .order_by('-datetime')[:10]

        recent_sales_data = []
        for s in recent_sales_qs:
            items_count = s.items.count()
            services_count = s.services.count()
            worker_names = list(filter(None, set((svc.worker.get_full_name() or svc.worker.username) for svc in s.services.all() if svc.worker)))
            workers_summary = ", ".join(worker_names) if worker_names else ""
            
            if items_count > 0 and services_count > 0:
                sale_type = 'MIXED'
                sale_type_display = f"{items_count} mahsulot • {services_count} xizmat"
            elif services_count > 0:
                sale_type = 'SERVICE_ONLY'
                sale_type_display = f"Faqat xizmat ({services_count} ta)" + (f" • {workers_summary}" if workers_summary else "")
            else:
                sale_type = 'PRODUCT_ONLY'
                sale_type_display = f"{items_count} mahsulot"

            recent_sales_data.append({
                'id': s.id,
                'datetime': s.datetime.isoformat(),
                'client': s.client.name if s.client else "Oddiy mijoz",
                'is_company': s.client.is_company if s.client else False,
                'car_plate': s.car.plate_number if s.car else "",
                'car_type': s.car.car_type if s.car else "",
                'payment_type': s.payment_type.name if s.payment_type else "Ko'rsatilmagan",
                'total_amount': float(s.total_amount),
                'paid_amount': float(s.paid_amount),
                'debt_amount': float(s.debt_amount),
                'items_count': items_count,
                'services_count': services_count,
                'sale_type': sale_type,
                'sale_type_display': sale_type_display,
                'workers_summary': workers_summary,
            })

        return Response({
            # Backward-compatible fields
            "kpi": {
                "total_revenue": float(total_revenue),
                "total_profit": float(gross_profit),
                "total_service_revenue": float(service_revenue),
                "total_sales": total_sales_count,
                "total_sales_debt": float(sales_agg['total_debt']),
                "total_external_debt_given": float(debts_given_unpaid),
                "total_external_debt_taken": float(debts_taken_unpaid),
                "product_revenue": float(product_revenue),
                "product_cost": float(product_cost),
                "product_profit": float(product_profit),
                "total_tool_fees": float(total_tool_fees),
                "total_worker_payments": float(total_worker_payments),
                "total_expenses": float(total_expenses),
                "net_profit": float(net_profit),
            },
            "chartData": chart_data,
            "productPerformance": top_products,
            "categoryPerformance": category_performance,
            "paymentPerformance": payment_breakdown,
            "recentSales": recent_sales_data,

            # Enhanced Structured Analytics
            "period_info": {
                "period": period_key,
                "label": period_label,
                "grouping": grouping,
                "start_date": start_dt.isoformat(),
                "end_date": end_dt.isoformat(),
                "shift_id": selected_shift.id if selected_shift else None,
            },
            "shift_info": {
                "id": selected_shift.id,
                "user_name": selected_shift.user.get_full_name() or selected_shift.user.username,
                "user_phone": selected_shift.user.phone_number,
                "status": selected_shift.status,
                "status_display": selected_shift.get_status_display(),
                "opened_at": selected_shift.opened_at.isoformat(),
                "closed_at": selected_shift.closed_at.isoformat() if selected_shift.closed_at else None,
                "starting_cash": float(selected_shift.starting_cash),
                "expected_cash": float(selected_shift.expected_cash),
                "actual_cash": float(selected_shift.actual_cash),
                "difference": float(selected_shift.difference),
                "notes": selected_shift.notes or "",
            } if selected_shift else None,
            "financial_summary": {
                "total_revenue": float(total_revenue),
                "product_revenue": float(product_revenue),
                "service_revenue": float(service_revenue),
                "product_cost": float(product_cost),
                "product_profit": float(product_profit),
                "total_tool_fees": float(total_tool_fees),
                "total_worker_payments": float(total_worker_payments),
                "gross_profit": float(gross_profit),
                "total_expenses": float(total_expenses),
                "net_profit": float(net_profit),
                "total_sales_count": total_sales_count,
                "company_sales_count": company_sales_count,
                "individual_sales_count": individual_sales_count,
                "products_sold_qty": float(items_agg['products_sold_qty']),
                "services_count": services_agg['services_count'],
            },
            "payment_breakdown": payment_breakdown,
            "live_snapshot": {
                "client_debts_total": float(debts_given_unpaid),
                "company_debts_total": float(debts_given_company),
                "individual_debts_total": float(individual_debts_total),
                "our_debts_total": float(debts_taken_unpaid),
                "workers_payable_balance": float(workers_payable_balance),
                "workers_debt_balance": float(workers_debt_balance),
                "workers_total_advances": float(workers_total_advances),
                "inventory": {
                    "total_items_count": total_items_count,
                    "total_stock_qty": float(inv_agg['total_stock_qty']),
                    "total_cost_val": float(inv_agg['total_cost_val']),
                    "total_sell_val": float(inv_agg['total_sell_val']),
                    "low_stock_count": low_stock_count,
                },
                "low_stock_products": low_stock_products,
            },
            "top_workers": top_workers,
            "top_products": top_products,
        })


@method_decorator(csrf_exempt, name='dispatch')
class PrinterSettingViewSet(viewsets.ModelViewSet):
    authentication_classes = [CsrfExemptSessionAuthentication]
    queryset = PrinterSetting.objects.all().order_by('id')
    serializer_class = PrinterSettingSerializer

    def list(self, request, *args, **kwargs):
        PrinterSetting.get_default_settings()
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='available-printers')
    def available_printers(self, request):
        printers = list_system_printers()
        return Response({"printers": printers})

    @action(detail=False, methods=['post'], url_path='test-print')
    def test_print(self, request):
        printer_type = request.data.get('printer_type')
        if not printer_type:
            return Response({"error": "printer_type talab qilinadi"}, status=status.HTTP_400_BAD_REQUEST)
        ok, msg = execute_test_print(printer_type)
        if ok:
            return Response({"detail": msg, "success": True})
        return Response({"error": msg, "success": False}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='print-barcode')
    def print_barcode(self, request):
        product_id = request.data.get('product_id')
        quantity = request.data.get('quantity', 1)
        barcode_val = request.data.get('barcode')
        skip_direct = request.data.get('skip_direct', False)

        if not product_id:
            return Response({"error": "product_id talab qilinadi"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            quantity = int(quantity)
            if quantity < 1:
                raise ValueError()
        except (ValueError, TypeError):
            return Response({"error": "Chop etish soni musbat butun son bo'lishi kerak"}, status=status.HTTP_400_BAD_REQUEST)

        label_b64 = get_barcode_label_b64(product_id, barcode_val=barcode_val)
        label_svg = get_barcode_label_svg(product_id, barcode_val=barcode_val)

        if skip_direct:
            return Response({
                "detail": "Windows orqali chop etish uchun tayyor",
                "success": True,
                "browser_print": True,
                "quantity": quantity,
                "label_image": label_b64,
                "label_svg": label_svg,
                "barcode": barcode_val
            })

        # Try direct print first
        ok, msg = print_product_barcode(product_id, quantity, barcode_val=barcode_val)
        return Response({
            "detail": msg,
            "success": ok,
            "error": None if ok else msg,
            "quantity": quantity,
            "label_image": label_b64,
            "label_svg": label_svg,
            "barcode": barcode_val,
            "can_fallback": not ok
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get', 'post'], url_path='barcode-preview')
    def barcode_preview(self, request):
        product_id = request.data.get('product_id') or request.query_params.get('product_id')
        barcode_val = request.data.get('barcode') or request.query_params.get('barcode')
        if not product_id:
            return Response({"error": "product_id talab qilinadi"}, status=status.HTTP_400_BAD_REQUEST)
        label_b64 = get_barcode_label_b64(int(product_id), barcode_val=barcode_val)
        label_svg = get_barcode_label_svg(int(product_id), barcode_val=barcode_val)
        return Response({
            "product_id": product_id,
            "barcode": barcode_val,
            "label_image": label_b64,
            "label_svg": label_svg
        })

    @action(detail=False, methods=['post'], url_path='print-sale')
    def print_sale(self, request):
        sale_id = request.data.get('sale_id')
        target_type = request.data.get('type', 'both')
        if not sale_id:
            return Response({"error": "sale_id talab qilinadi"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            sale = Sale.objects.get(id=sale_id)
        except Sale.DoesNotExist:
            return Response({"error": "Sotuv topilmadi"}, status=status.HTTP_404_NOT_FOUND)

        results = print_sale_tickets(sale, target=target_type)
        return Response({"detail": "Chop etish bajarildi", "results": results})


@method_decorator(csrf_exempt, name='dispatch')
class CurrencySettingViewSet(viewsets.ModelViewSet):
    authentication_classes = [CsrfExemptSessionAuthentication]
    queryset = CurrencySetting.objects.all().order_by('id')
    serializer_class = CurrencySettingSerializer

    @action(detail=False, methods=['get'], url_path='current')
    def current(self, request):
        setting = CurrencySetting.objects.filter(code='USD').first()
        if not setting:
            setting = CurrencySetting.objects.create(code='USD', name="AQSH Dollari", symbol="$", rate_in_uzs=12500.00)
        return Response(CurrencySettingSerializer(setting).data)

    @action(detail=False, methods=['post'], url_path='set-rate')
    def set_rate(self, request):
        from django.db import connection
        rate = request.data.get('rate')
        if rate is None or rate == '':
            return Response({"error": "Valyuta kursi talab qilinadi (rate)"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            rate_dec = Decimal(str(rate))
            if rate_dec <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return Response({"error": "Kurs musbat son bo'lishi kerak"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            setting = CurrencySetting.objects.filter(code='USD').first()
            if not setting:
                setting = CurrencySetting.objects.create(code='USD', name="AQSH Dollari", symbol="$", rate_in_uzs=rate_dec)
            else:
                setting.rate_in_uzs = rate_dec
                setting.save()

            rate_float = float(rate_dec)
            with connection.cursor() as cursor:
                # 1. Backfill any products that had UZS prices but no USD price yet
                cursor.execute("""
                    UPDATE api_product
                    SET cost_price_usd = ROUND(cost_price / %s, 4),
                        selling_price_usd = ROUND(selling_price / %s, 4)
                    WHERE (cost_price_usd = 0 OR cost_price_usd IS NULL) AND cost_price > 0
                """, [rate_float, rate_float])

                # 2. Recalculate UZS prices for ALL products based on their USD prices
                cursor.execute("""
                    UPDATE api_product
                    SET cost_price = ROUND(cost_price_usd * %s, 2),
                        selling_price = ROUND(selling_price_usd * %s, 2)
                    WHERE cost_price_usd > 0 OR selling_price_usd > 0
                """, [rate_float, rate_float])

            total_products = Product.objects.count()

        return Response({
            "detail": f"USD kursi {rate_dec:,.2f} UZS ga muvaffaqiyatli yangilandi va barcha {total_products} mahsulot narxlari qayta hisoblandi.",
            "rate": float(rate_dec),
            "updated_products": total_products
        })


class SaleServiceViewSet(viewsets.ModelViewSet):
    queryset = SaleService.objects.all().select_related('sale', 'worker', 'sale__client').order_by('-created_at')
    serializer_class = SaleServiceSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['sale', 'worker']
    search_fields = ['service_name', 'worker__first_name', 'worker__last_name', 'worker__phone_number']
    ordering_fields = ['id', 'amount', 'created_at']


def parse_date_range(month_str=None, date_from_str=None, date_to_str=None):
    now = timezone.now()
    if date_from_str and date_to_str:
        try:
            df = datetime.strptime(date_from_str, '%Y-%m-%d')
            dt = datetime.strptime(date_to_str, '%Y-%m-%d')
            start_date = timezone.make_aware(datetime(df.year, df.month, df.day, 0, 0, 0))
            end_date = timezone.make_aware(datetime(dt.year, dt.month, dt.day, 23, 59, 59, 999999))
            return start_date, end_date, f"{date_from_str} dan {date_to_str} gacha"
        except Exception:
            pass

    if not month_str:
        month_str = now.strftime('%Y-%m')

    try:
        parts = month_str.split('-')
        year = int(parts[0])
        month = int(parts[1])
        _, last_day = calendar.monthrange(year, month)
        start_date = timezone.make_aware(datetime(year, month, 1, 0, 0, 0))
        end_date = timezone.make_aware(datetime(year, month, last_day, 23, 59, 59, 999999))
        period_label = f"{year}-{month:02d}"
    except Exception:
        _, last_day = calendar.monthrange(now.year, now.month)
        start_date = timezone.make_aware(datetime(now.year, now.month, 1, 0, 0, 0))
        end_date = timezone.make_aware(datetime(now.year, now.month, last_day, 23, 59, 59, 999999))
        period_label = now.strftime('%Y-%m')

    return start_date, end_date, period_label


@method_decorator(csrf_exempt, name='dispatch')
class WorkerTransactionViewSet(viewsets.ModelViewSet):
    authentication_classes = [CsrfExemptSessionAuthentication]
    queryset = WorkerTransaction.objects.all().select_related('worker', 'created_by', 'shift', 'cashflow').order_by('-created_at', '-id')
    serializer_class = WorkerTransactionSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = WorkerTransactionFilter
    search_fields = ['worker__first_name', 'worker__last_name', 'worker__phone_number', 'note']
    ordering_fields = ['id', 'created_at', 'amount', 'period_month']

    def perform_create(self, serializer):
        user = self.request.user if (self.request.user and self.request.user.is_authenticated) else None
        active_shift = Shift.objects.filter(user=user, status='OPEN').first() if user else Shift.objects.filter(status='OPEN').order_by('-opened_at').first()
        
        trans_type = serializer.validated_data.get('transaction_type')
        payment_method = serializer.validated_data.get('payment_method', 'NONE')
        amount = Decimal(str(serializer.validated_data.get('amount', 0)))
        note = serializer.validated_data.get('note', '')
        worker = serializer.validated_data.get('worker')
        worker_name = worker.get_full_name() or worker.username if worker else "Usta"

        # Check if CashFlow should be created when cash is handled in an active shift
        create_cashflow = self.request.data.get('create_cashflow', True)
        cashflow = None

        if payment_method in ('CASH', 'CARD', 'TRANSFER') and create_cashflow and amount > 0:
            from .models import PaymentMethod
            pm_obj = None
            if payment_method == 'CASH':
                pm_obj = PaymentMethod.objects.filter(Q(name__icontains='naqd') | Q(name__icontains='cash')).first()
            elif payment_method == 'CARD':
                pm_obj = PaymentMethod.objects.filter(Q(name__icontains='karta') | Q(name__icontains='card') | Q(name__icontains='humo') | Q(name__icontains='uzcard')).first()
            elif payment_method == 'TRANSFER':
                pm_obj = PaymentMethod.objects.filter(Q(name__icontains='transfer') | Q(name__icontains="o'tkazma") | Q(name__icontains='hisob') | Q(name__icontains='bank')).first()
            if not pm_obj:
                pm_obj = PaymentMethod.objects.first()

            if trans_type in ('PAYOUT', 'WORKER_DEBT'):
                # Money paid to worker -> CashFlow EXPENSE
                cf_desc = f"Usta to'lovi ({worker_name}) [{dict(WorkerTransaction.TRANSACTION_TYPES).get(trans_type, trans_type)}]: {note}".strip()
                cashflow = CashFlow.objects.create(
                    transaction_type='EXPENSE',
                    category='OTHER',
                    amount=amount,
                    payment_method=pm_obj,
                    shift=active_shift,
                    user=user,
                    description=cf_desc
                )
            elif trans_type == 'TOOL_FEE':
                # Worker physically paid for tool/lift fee -> CashFlow INCOME
                cf_desc = f"Usta asbob/podyomnik to'lovi ({worker_name}): {note}".strip()
                cashflow = CashFlow.objects.create(
                    transaction_type='INCOME',
                    category='OTHER',
                    amount=amount,
                    payment_method=pm_obj,
                    shift=active_shift,
                    user=user,
                    description=cf_desc
                )
            elif trans_type == 'WORKER_PAYMENT':
                # Worker pays shop (qarz/podyomnik yopish) -> CashFlow INCOME
                note_str = f" - {note}" if note else ""
                cf_desc = f"Ustadan to'lov (Qarz/Podyomnik yopish): {worker_name}{note_str}".strip()
                cashflow = CashFlow.objects.create(
                    transaction_type='INCOME',
                    category='DEBT',
                    amount=amount,
                    payment_method=pm_obj,
                    shift=active_shift,
                    user=user,
                    description=cf_desc
                )

        serializer.save(
            created_by=user,
            shift=active_shift,
            cashflow=cashflow
        )

    def perform_destroy(self, instance):
        if instance.cashflow:
            instance.cashflow.delete()
        instance.delete()


@method_decorator(csrf_exempt, name='dispatch')
class WorkerTabViewSet(viewsets.ViewSet):
    authentication_classes = [CsrfExemptSessionAuthentication]

    def list(self, request):
        month = request.query_params.get('month')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        start_date, end_date, period_label = parse_date_range(month, date_from, date_to)

        workers = User.objects.filter(role='WORKER', is_active=True).order_by('id')
        
        result = []
        for worker in workers:
            # Service earnings in period
            services_qs = SaleService.objects.filter(
                worker=worker,
                sale__datetime__gte=start_date,
                sale__datetime__lte=end_date
            ).select_related('sale', 'sale__client')

            total_earned = Decimal('0.00')
            paid_earned = Decimal('0.00')
            unpaid_earned = Decimal('0.00')
            services_count = 0

            for svc in services_qs:
                services_count += 1
                amt = Decimal(str(svc.amount or 0))
                total_earned += amt
                sale = svc.sale
                total_sale = Decimal(str(sale.total_amount or 0))
                paid_sale = Decimal(str(sale.paid_amount or 0))

                if total_sale <= 0:
                    ratio = Decimal('1.0')
                else:
                    ratio = min(Decimal('1.0'), max(Decimal('0.0'), paid_sale / total_sale))

                realized = round(amt * ratio, 2)
                pending = amt - realized
                paid_earned += realized
                unpaid_earned += pending

            # Ledger transactions for worker in this period
            trans_qs = WorkerTransaction.objects.filter(
                worker=worker
            ).filter(
                Q(period_month=period_label) |
                Q(created_at__gte=start_date, created_at__lte=end_date)
            ).distinct()

            total_tool_fees = Decimal('0.00')
            total_worker_debts = Decimal('0.00')
            total_payouts = Decimal('0.00')
            total_bonuses = Decimal('0.00')
            total_worker_payments = Decimal('0.00')

            for tr in trans_qs:
                amt = Decimal(str(tr.amount or 0))
                if tr.transaction_type == 'TOOL_FEE':
                    total_tool_fees += amt
                elif tr.transaction_type == 'WORKER_DEBT':
                    total_worker_debts += amt
                elif tr.transaction_type == 'PAYOUT':
                    total_payouts += amt
                elif tr.transaction_type == 'BONUS':
                    total_bonuses += amt
                elif tr.transaction_type == 'WORKER_PAYMENT':
                    total_worker_payments += amt

            total_deductions = total_tool_fees + total_worker_debts + total_payouts - total_bonuses - total_worker_payments
            net_balance_total = total_earned + total_worker_payments + total_bonuses - total_tool_fees - total_worker_debts - total_payouts
            net_balance_payable_now = paid_earned + total_worker_payments + total_bonuses - total_tool_fees - total_worker_debts - total_payouts

            # Goods / Spare parts taken on credit / debt by worker
            worker_goods_sales_all = Sale.objects.filter(
                Q(client__worker=worker) |
                Q(client__phone_number=worker.phone_number)
            ).prefetch_related('items').distinct()
            total_goods_taken = worker_goods_sales_all.filter(datetime__gte=start_date, datetime__lte=end_date).aggregate(t=Sum('total_amount'))['t'] or Decimal('0.00')
            total_goods_debt = worker_goods_sales_all.aggregate(d=Sum('debt_amount'))['d'] or Decimal('0.00')

            result.append({
                'id': worker.id,
                'worker_id': worker.id,
                'name': worker.get_full_name() or worker.username,
                'worker_name': worker.get_full_name() or worker.username,
                'phone_number': worker.phone_number,
                'job': worker.job or 'Usta',
                'monthly_tool_fee': float(worker.monthly_tool_fee or 0),
                'total_service_earned': float(total_earned),
                'paid_service_earned': float(paid_earned),
                'unpaid_company_debt_service': float(unpaid_earned),
                'total_tool_fees': float(total_tool_fees),
                'total_worker_debts': float(total_worker_debts),
                'total_payouts': float(total_payouts),
                'total_bonuses': float(total_bonuses),
                'total_worker_payments': float(total_worker_payments),
                'total_deductions': float(total_deductions),
                'total_goods_taken': float(total_goods_taken),
                'total_goods_debt': float(total_goods_debt),
                'net_balance_total': float(net_balance_total),
                'net_balance_payable_now': float(net_balance_payable_now),
                'services_count': services_count,
            })

        return Response({
            'period': {
                'month': period_label,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            },
            'workers': result
        })

    def retrieve(self, request, pk=None):
        try:
            worker = User.objects.get(pk=pk, role='WORKER')
        except User.DoesNotExist:
            return Response({"detail": "Usta topilmadi."}, status=status.HTTP_404_NOT_FOUND)

        month = request.query_params.get('month')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        start_date, end_date, period_label = parse_date_range(month, date_from, date_to)

        client_filter = request.query_params.get('client')
        is_company_filter = request.query_params.get('is_company')
        payment_status_filter = request.query_params.get('payment_status')

        # 1. Services Query
        services_qs = SaleService.objects.filter(
            worker=worker,
            sale__datetime__gte=start_date,
            sale__datetime__lte=end_date
        ).select_related('sale', 'sale__client', 'sale__car', 'worker').prefetch_related('sale__items', 'sale__items__product').order_by('-sale__datetime', '-id')

        if client_filter:
            services_qs = services_qs.filter(sale__client_id=client_filter)
        if is_company_filter is not None and is_company_filter != '':
            is_comp = is_company_filter.lower() in ('true', '1')
            services_qs = services_qs.filter(sale__client__is_company=is_comp)

        total_earned = Decimal('0.00')
        paid_earned = Decimal('0.00')
        unpaid_earned = Decimal('0.00')

        services_rows = []
        for svc in services_qs:
            amt = Decimal(str(svc.amount or 0))
            sale = svc.sale
            total_sale = Decimal(str(sale.total_amount or 0))
            paid_sale = Decimal(str(sale.paid_amount or 0))
            debt_sale = Decimal(str(sale.debt_amount or 0))

            if total_sale <= 0:
                ratio = Decimal('1.0')
            else:
                ratio = min(Decimal('1.0'), max(Decimal('0.0'), paid_sale / total_sale))

            realized = round(amt * ratio, 2)
            pending = amt - realized

            total_earned += amt
            paid_earned += realized
            unpaid_earned += pending

            if ratio >= Decimal('0.999'):
                st = 'PAID'
                st_disp = "To'langan"
            elif ratio <= Decimal('0.001'):
                st = 'UNPAID'
                st_disp = "Qarzda"
            else:
                st = 'PARTIAL'
                st_disp = "Qisman to'langan"

            if payment_status_filter and payment_status_filter != st:
                continue

            products_summary_parts = []
            for itm in sale.items.all():
                products_summary_parts.append(f"{itm.product.name} ({itm.quantity} dona)")
            products_summary = ", ".join(products_summary_parts) if products_summary_parts else "Faqat xizmat"

            services_rows.append({
                'id': svc.id,
                'sale_id': sale.id,
                'datetime': sale.datetime.isoformat(),
                'client_id': sale.client_id,
                'client_name': sale.client.name if sale.client else "Oddiy mijoz",
                'is_company': sale.client.is_company if sale.client else False,
                'client_phone': sale.client.phone_number if sale.client else "",
                'car_plate': sale.car.plate_number if sale.car else "",
                'car_type': sale.car.car_type if sale.car else "",
                'service_name': svc.service_name,
                'amount': float(amt),
                'sale_total': float(total_sale),
                'sale_paid': float(paid_sale),
                'sale_debt': float(debt_sale),
                'payment_ratio': float(ratio),
                'realized_amount': float(realized),
                'pending_amount': float(pending),
                'payment_status': st,
                'payment_status_display': st_disp,
                'products_summary': products_summary
            })

        # 2. Worker Transactions (Ledger deductions/advances/payouts)
        trans_qs = WorkerTransaction.objects.filter(
            worker=worker
        ).filter(
            Q(period_month=period_label) |
            Q(created_at__gte=start_date, created_at__lte=end_date)
        ).select_related('created_by', 'shift', 'cashflow').order_by('-created_at', '-id').distinct()

        total_tool_fees = Decimal('0.00')
        total_worker_debts = Decimal('0.00')
        total_payouts = Decimal('0.00')
        total_bonuses = Decimal('0.00')
        total_worker_payments = Decimal('0.00')

        transactions_rows = []
        for tr in trans_qs:
            amt = Decimal(str(tr.amount or 0))
            if tr.transaction_type == 'TOOL_FEE':
                total_tool_fees += amt
            elif tr.transaction_type == 'WORKER_DEBT':
                total_worker_debts += amt
            elif tr.transaction_type == 'PAYOUT':
                total_payouts += amt
            elif tr.transaction_type == 'BONUS':
                total_bonuses += amt
            elif tr.transaction_type == 'WORKER_PAYMENT':
                total_worker_payments += amt

            transactions_rows.append({
                'id': tr.id,
                'transaction_type': tr.transaction_type,
                'transaction_type_display': tr.get_transaction_type_display(),
                'amount': float(amt),
                'period_month': tr.period_month,
                'payment_method': tr.payment_method,
                'payment_method_display': tr.get_payment_method_display(),
                'note': tr.note,
                'created_at': tr.created_at.isoformat(),
                'created_by_name': tr.created_by.get_full_name() if tr.created_by else "",
                'cashflow_id': tr.cashflow_id
            })

        total_deductions = total_tool_fees + total_worker_debts + total_payouts - total_bonuses - total_worker_payments
        net_balance_total = total_earned + total_worker_payments + total_bonuses - total_tool_fees - total_worker_debts - total_payouts
        net_balance_payable_now = paid_earned + total_worker_payments + total_bonuses - total_tool_fees - total_worker_debts - total_payouts

        # 3. Worker Sales & Debts (Products taken on credit / debt by worker)
        worker_sales_qs = Sale.objects.filter(
            Q(client__worker=worker) |
            Q(client__phone_number=worker.phone_number)
        ).prefetch_related('items', 'items__product', 'items__product__unit', 'debts').distinct().order_by('-datetime', '-id')

        total_goods_debt_all_time = worker_sales_qs.aggregate(d=Sum('debt_amount'))['d'] or Decimal('0.00')
        period_worker_sales = worker_sales_qs.filter(datetime__gte=start_date, datetime__lte=end_date)
        total_goods_taken_period = period_worker_sales.aggregate(t=Sum('total_amount'))['t'] or Decimal('0.00')
        total_goods_debt_period = period_worker_sales.aggregate(d=Sum('debt_amount'))['d'] or Decimal('0.00')

        goods_sales_rows = []
        for s in worker_sales_qs:
            itms = []
            for it in s.items.all():
                itms.append({
                    'id': it.id,
                    'product_name': it.product.name,
                    'quantity': float(it.quantity),
                    'unit_name': it.product.unit.short_name if it.product.unit else 'dona',
                    'price': float(it.price),
                    'total': float(it.total)
                })
            
            items_summary = ", ".join(f"{it['product_name']} ({it['quantity']} {it['unit_name']})" for it in itms) if itms else "Faqat xizmat"
            st = 'PAID' if Decimal(str(s.debt_amount)) <= 0 else ('PARTIAL' if Decimal(str(s.paid_amount)) > 0 else 'UNPAID')
            st_disp = "To'langan" if st == 'PAID' else ("Qisman to'langan" if st == 'PARTIAL' else "Qarzda (Nasiya)")

            goods_sales_rows.append({
                'id': s.id,
                'sale_id': s.id,
                'datetime': s.datetime.isoformat(),
                'total_amount': float(s.total_amount),
                'paid_amount': float(s.paid_amount),
                'debt_amount': float(s.debt_amount),
                'due_date': s.due_date.isoformat() if s.due_date else None,
                'status': st,
                'status_display': st_disp,
                'car_plate': s.car.plate_number if s.car else "",
                'items': itms,
                'items_summary': items_summary
            })

        return Response({
            'worker': {
                'id': worker.id,
                'name': worker.get_full_name() or worker.username,
                'phone_number': worker.phone_number,
                'job': worker.job or 'Usta',
                'monthly_tool_fee': float(worker.monthly_tool_fee or 0),
            },
            'period': {
                'month': period_label,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            },
            'summary': {
                'total_service_earned': float(total_earned),
                'paid_service_earned': float(paid_earned),
                'unpaid_company_debt_service': float(unpaid_earned),
                'total_tool_fees': float(total_tool_fees),
                'total_worker_debts': float(total_worker_debts),
                'total_payouts': float(total_payouts),
                'total_bonuses': float(total_bonuses),
                'total_worker_payments': float(total_worker_payments),
                'total_deductions': float(total_deductions),
                'total_goods_taken': float(total_goods_taken_period),
                'total_goods_debt': float(total_goods_debt_period),
                'total_goods_debt_all_time': float(total_goods_debt_all_time),
                'net_balance_total': float(net_balance_total),
                'net_balance_payable_now': float(net_balance_payable_now),
                'services_count': len(services_rows),
                'goods_sales_count': len(goods_sales_rows),
            },
            'services': services_rows,
            'transactions': transactions_rows,
            'goods_sales': goods_sales_rows
        })

    @action(detail=False, methods=['post'], url_path='charge-monthly-tool-fee')
    def charge_monthly_tool_fee(self, request):
        worker_id = request.data.get('worker_id')
        period_month = request.data.get('period_month')
        if not period_month:
            period_month = timezone.now().strftime('%Y-%m')

        amount_override = request.data.get('amount')
        note = request.data.get('note', '')
        user = request.user if (request.user and request.user.is_authenticated) else None

        created = []
        if worker_id:
            workers = User.objects.filter(pk=worker_id, role='WORKER')
        else:
            workers = User.objects.filter(role='WORKER', is_active=True)

        for w in workers:
            amt = Decimal(str(amount_override)) if amount_override is not None and str(amount_override).strip() != '' else (w.monthly_tool_fee or Decimal('0.00'))
            if amt <= 0:
                continue

            existing = WorkerTransaction.objects.filter(
                worker=w,
                transaction_type='TOOL_FEE',
                period_month=period_month
            ).first()

            if existing:
                continue

            entry_note = note if note else f"{period_month} oyi uchun podyomnik va asbob-uskuna to'lovi"
            tr = WorkerTransaction.objects.create(
                worker=w,
                transaction_type='TOOL_FEE',
                amount=amt,
                period_month=period_month,
                payment_method='NONE',
                note=entry_note,
                created_by=user
            )
            created.append({
                'id': tr.id,
                'worker_id': w.id,
                'worker_name': w.get_full_name() or w.username,
                'amount': float(amt),
                'period_month': period_month
            })

        return Response({
            'detail': f"{len(created)} ta ustaga {period_month} oyi uchun podyomnik/asbob to'lovi hisoblandi.",
            'charged_count': len(created),
            'items': created
        })


