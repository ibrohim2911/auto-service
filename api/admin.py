from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Category, Product, Inventory, StockTransfer, Client, Car, ProductReceipt, ProductReceiptItem, Sale, SaleItem, Shift, CashFlow

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Additional Info', {'fields': ('phone_number', 'role', 'job')}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Additional Info', {'fields': ('phone_number', 'role', 'job')}),
    )
    list_display = ('username', 'phone_number', 'first_name', 'last_name', 'role', 'is_staff')
    list_filter = ('role', 'is_staff', 'is_superuser', 'is_active')
    search_fields = ('username', 'phone_number', 'first_name', 'last_name')
    ordering = ('username',)

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)

class InventoryInline(admin.TabularInline):
    model = Inventory
    extra = 1

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'barcode', 'category', 'unit', 'cost_price', 'selling_price')
    list_filter = ('category', 'unit')
    search_fields = ('name', 'barcode')
    inlines = [InventoryInline]

@admin.register(Inventory)
class InventoryAdmin(admin.ModelAdmin):
    list_display = ('product', 'location', 'quantity')
    list_filter = ('location',)
    search_fields = ('product__name', 'product__barcode')

@admin.register(StockTransfer)
class StockTransferAdmin(admin.ModelAdmin):
    list_display = ('product', 'from_location', 'to_location', 'quantity', 'user', 'created_at')
    list_filter = ('from_location', 'to_location', 'created_at')
    search_fields = ('product__name', 'product__barcode', 'note')

@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_company', 'phone_number', 'account_number')
    list_filter = ('is_company',)
    search_fields = ('name', 'phone_number', 'account_number')

@admin.register(Car)
class CarAdmin(admin.ModelAdmin):
    list_display = ('plate_number', 'owner', 'car_type')
    search_fields = ('plate_number', 'owner__name')

class ProductReceiptItemInline(admin.TabularInline):
    model = ProductReceiptItem
    extra = 1

@admin.register(ProductReceipt)
class ProductReceiptAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'date', 'total_cost')
    list_filter = ('date', 'user')
    inlines = [ProductReceiptItemInline]

class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 1

@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ('id', 'client', 'user', 'payment_type', 'total_amount', 'paid_amount', 'debt_amount', 'datetime')
    list_filter = ('payment_type', 'datetime', 'user')
    search_fields = ('client__name',)
    inlines = [SaleItemInline]

@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'opened_at', 'closed_at', 'expected_cash', 'actual_cash', 'difference')
    list_filter = ('opened_at', 'user')

@admin.register(CashFlow)
class CashFlowAdmin(admin.ModelAdmin):
    list_display = ('transaction_type', 'category', 'amount', 'payment_method', 'client', 'user', 'datetime')
    list_filter = ('transaction_type', 'category', 'payment_method', 'datetime')
    search_fields = ('client__name', 'description')
