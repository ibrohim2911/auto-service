from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet, CategoryViewSet, UnitViewSet, PaymentMethodViewSet, ProductViewSet, InventoryViewSet,
    StockTransferViewSet, ClientViewSet, CarViewSet, ProductReceiptViewSet, ProductReceiptItemViewSet,
    SaleViewSet, SaleItemViewSet, ShiftViewSet, CashFlowViewSet, LoginView, LogoutView, DebtViewSet, DashboardStatsView,
    PrinterSettingViewSet, CurrencySettingViewSet, SaleServiceViewSet, WorkerTransactionViewSet, WorkerTabViewSet,
    ClientTransactionViewSet, OrganizationTabViewSet
)

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'categories', CategoryViewSet)
router.register(r'units', UnitViewSet)
router.register(r'payment-methods', PaymentMethodViewSet)
router.register(r'products', ProductViewSet)
router.register(r'inventories', InventoryViewSet)
router.register(r'stock-transfers', StockTransferViewSet)
router.register(r'clients', ClientViewSet)
router.register(r'cars', CarViewSet)
router.register(r'receipts', ProductReceiptViewSet)
router.register(r'receipt-items', ProductReceiptItemViewSet)
router.register(r'sales', SaleViewSet)
router.register(r'sale-items', SaleItemViewSet)
router.register(r'sale-services', SaleServiceViewSet)
router.register(r'worker-transactions', WorkerTransactionViewSet)
router.register(r'worker-tabs', WorkerTabViewSet, basename='worker-tabs')
router.register(r'client-transactions', ClientTransactionViewSet)
router.register(r'organization-tabs', OrganizationTabViewSet, basename='organization-tabs')
router.register(r'shifts', ShiftViewSet)
router.register(r'cash-flow', CashFlowViewSet)
router.register(r'debts', DebtViewSet)
router.register(r'printers', PrinterSettingViewSet)
router.register(r'currency-settings', CurrencySettingViewSet)

urlpatterns = [
    path('auth/login/', LoginView.as_view(), name='auth_login'),
    path('auth/logout/', LogoutView.as_view(), name='auth_logout'),
    path('dashboard-stats/', DashboardStatsView.as_view(), name='dashboard_stats'),
    path('', include(router.urls)),
]

