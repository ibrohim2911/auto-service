from rest_framework import viewsets, filters, status, permissions
from rest_framework.decorators import action
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from .models import (
    User, Category, Unit, PaymentMethod, Product, Inventory, StockTransfer, Client, Car, 
    ProductReceipt, ProductReceiptItem, Sale, SaleItem, Shift, CashFlow, Debt, PrinterSetting,
    CurrencySetting
)
from .serializers import (
    UserSerializer, CategorySerializer, UnitSerializer, PaymentMethodSerializer, ProductSerializer, InventorySerializer,
    StockTransferSerializer, ClientSerializer, CarSerializer, ProductReceiptSerializer, ProductReceiptItemSerializer,
    SaleSerializer, SaleItemSerializer, ShiftSerializer, CashFlowSerializer, DebtSerializer, PrinterSettingSerializer,
    CurrencySettingSerializer
)
from .printer_service import (
    list_system_printers, execute_test_print, print_sale_tickets, print_product_barcode
)
from .filters import ProductFilter, SaleFilter, CashFlowFilter, DebtFilter, ProductReceiptFilter, ShiftFilter, StockTransferFilter
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Sum, Count, F
from django.db.models.functions import TruncDate
from datetime import timedelta
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
    ).order_by('id')
    serializer_class = ProductSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = ProductFilter
    search_fields = ['name', 'barcode']
    ordering_fields = ['id', 'name', 'cost_price', 'selling_price', 'created_at', 'total_quantity']

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
    queryset = Sale.objects.all().select_related('client', 'user', 'car', 'payment_type').prefetch_related('items', 'items__product').order_by('-datetime')
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
    search_fields = ['user__username', 'user__first_name', 'notes']
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

class DashboardStatsView(APIView):
    def get(self, request):
        now = timezone.now()
        thirty_days_ago = now - timedelta(days=30)
        
        # 1. Total KPI
        sales_agg = Sale.objects.aggregate(
            total_revenue=Sum('total_amount'),
            total_paid=Sum('paid_amount'),
            total_debt=Sum('debt_amount'),
            total_sales_count=Count('id')
        )
        
        # Calculate Cost for Profit
        cost_agg = SaleItem.objects.aggregate(
            total_cost=Sum('total_cost')
        )
        
        total_revenue = sales_agg['total_revenue'] or 0
        total_cost = cost_agg['total_cost'] or 0
        total_profit = total_revenue - total_cost
        
        # External debts
        debts_given = Debt.objects.filter(debt_type='GIVEN').aggregate(unpaid=Sum('amount') - Sum('paid_amount'))['unpaid'] or 0
        debts_taken = Debt.objects.filter(debt_type='TAKEN').aggregate(unpaid=Sum('amount') - Sum('paid_amount'))['unpaid'] or 0

        # 2. Daily Revenue (last 30 days)
        daily_sales = Sale.objects.filter(datetime__gte=thirty_days_ago) \
            .annotate(date=TruncDate('datetime')) \
            .values('date') \
            .annotate(Revenue=Sum('total_amount')) \
            .order_by('date')
            
        chart_data = [{"name": str(s['date']), "Revenue": float(s['Revenue'])} for s in daily_sales]
        
        # 3. Product Performance (Top 5)
        top_products = SaleItem.objects.values('product__name') \
            .annotate(value=Sum('total'), qty=Sum('quantity')) \
            .order_by('-value')[:5]
        product_performance = [{"name": p['product__name'], "value": float(p['value']), "qty": float(p['qty'])} for p in top_products]
        
        # 4. Category Performance
        cat_performance = SaleItem.objects.values('product__category__name') \
            .annotate(value=Sum('total')) \
            .order_by('-value')
        category_performance = [{"name": c['product__category__name'] or 'Uncategorized', "value": float(c['value'])} for c in cat_performance]
        
        # 5. Payment Methods Performance
        # Assuming CashFlow has accurate income for sales
        pay_performance = CashFlow.objects.filter(transaction_type='INCOME') \
            .values('payment_method__name') \
            .annotate(value=Sum('amount')) \
            .order_by('-value')
        payment_performance = [{"name": p['payment_method__name'] or 'Unknown', "value": float(p['value'])} for p in pay_performance]
        
        # 6. Recent Sales (Top 5)
        recent_sales = Sale.objects.select_related('client').prefetch_related('items').order_by('-datetime')[:5]
        recent_sales_data = []
        for s in recent_sales:
            recent_sales_data.append({
                "id": s.id,
                "client": s.client.name if s.client else "Oddiy mijoz",
                "datetime": s.datetime,
                "total_amount": float(s.total_amount),
                "items_count": s.items.count()
            })
            
        return Response({
            "kpi": {
                "total_revenue": float(total_revenue),
                "total_profit": float(total_profit),
                "total_sales": sales_agg['total_sales_count'],
                "total_sales_debt": float(sales_agg['total_debt'] or 0),
                "total_external_debt_given": float(debts_given),
                "total_external_debt_taken": float(debts_taken)
            },
            "chartData": chart_data,
            "productPerformance": product_performance,
            "categoryPerformance": category_performance,
            "paymentPerformance": payment_performance,
            "recentSales": recent_sales_data
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
        if not product_id:
            return Response({"error": "product_id talab qilinadi"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            quantity = int(quantity)
            if quantity < 1:
                raise ValueError()
        except (ValueError, TypeError):
            return Response({"error": "Chop etish soni musbat butun son bo'lishi kerak"}, status=status.HTTP_400_BAD_REQUEST)

        ok, msg = print_product_barcode(product_id, quantity)
        if ok:
            return Response({"detail": msg, "success": True, "quantity": quantity})
        return Response({"error": msg, "success": False}, status=status.HTTP_400_BAD_REQUEST)

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


