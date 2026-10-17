import django_filters
from .models import Product, Sale, CashFlow, Debt, ProductReceipt, Shift, StockTransfer

class ProductFilter(django_filters.FilterSet):
    min_price = django_filters.NumberFilter(field_name="selling_price", lookup_expr='gte')
    max_price = django_filters.NumberFilter(field_name="selling_price", lookup_expr='lte')
    
    class Meta:
        model = Product
        fields = ['category', 'unit']

class SaleFilter(django_filters.FilterSet):
    start_date = django_filters.DateTimeFilter(field_name="datetime", lookup_expr='gte')
    end_date = django_filters.DateTimeFilter(field_name="datetime", lookup_expr='lte')
    min_amount = django_filters.NumberFilter(field_name="total_amount", lookup_expr='gte')
    max_amount = django_filters.NumberFilter(field_name="total_amount", lookup_expr='lte')
    due_date_start = django_filters.DateFilter(field_name="due_date", lookup_expr='gte')
    due_date_end = django_filters.DateFilter(field_name="due_date", lookup_expr='lte')
    has_debt = django_filters.BooleanFilter(method='filter_has_debt')

    def filter_has_debt(self, queryset, name, value):
        if value:
            return queryset.filter(debt_amount__gt=0)
        return queryset

    class Meta:
        model = Sale
        fields = ['payment_type', 'user', 'client', 'due_date']

class CashFlowFilter(django_filters.FilterSet):
    start_date = django_filters.DateTimeFilter(field_name="datetime", lookup_expr='gte')
    end_date = django_filters.DateTimeFilter(field_name="datetime", lookup_expr='lte')
    min_amount = django_filters.NumberFilter(field_name="amount", lookup_expr='gte')
    max_amount = django_filters.NumberFilter(field_name="amount", lookup_expr='lte')

    class Meta:
        model = CashFlow
        fields = ['transaction_type', 'category', 'payment_method', 'client', 'user', 'sale']

class DebtFilter(django_filters.FilterSet):
    start_date = django_filters.DateTimeFilter(field_name="created_at", lookup_expr='gte')
    end_date = django_filters.DateTimeFilter(field_name="created_at", lookup_expr='lte')
    due_date_start = django_filters.DateFilter(field_name="due_date", lookup_expr='gte')
    due_date_end = django_filters.DateFilter(field_name="due_date", lookup_expr='lte')

    class Meta:
        model = Debt
        fields = ['debt_type', 'status', 'client']

class ShiftFilter(django_filters.FilterSet):
    start_date = django_filters.DateTimeFilter(field_name="opened_at", lookup_expr='gte')
    end_date = django_filters.DateTimeFilter(field_name="opened_at", lookup_expr='lte')
    status = django_filters.CharFilter(field_name="status")
    
    class Meta:
        model = Shift
        fields = ['user', 'status']

class ProductReceiptFilter(django_filters.FilterSet):
    start_date = django_filters.DateTimeFilter(field_name="date", lookup_expr='gte')
    end_date = django_filters.DateTimeFilter(field_name="date", lookup_expr='lte')
    
    class Meta:
        model = ProductReceipt
        fields = ['user']

class StockTransferFilter(django_filters.FilterSet):
    start_date = django_filters.DateTimeFilter(field_name="created_at", lookup_expr='gte')
    end_date = django_filters.DateTimeFilter(field_name="created_at", lookup_expr='lte')
    
    class Meta:
        model = StockTransfer
        fields = ['product', 'from_location', 'to_location', 'user']

