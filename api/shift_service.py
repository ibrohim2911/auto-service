from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum, Q
from .models import Shift, CashFlow, Sale, PaymentMethod

def is_cash_method(pm):
    if not pm:
        return True
    name = (pm.name or '').strip().lower()
    return 'naqd' in name or 'naxt' in name or 'cash' in name

def calculate_shift_summary(shift):
    """
    Computes exact cash drawer reconciliation, all payment methods, and business turnover for a shift:
    - starting_cash (boshlang'ich kassa)
    - cash_sale_income (naqd savdo tushumi)
    - cash_debt_income (naqd qarz yig'ish / to'lovlar)
    - other_cash_income (boshqa naqd kirimlar, ustadan to'lov)
    - total_cash_income (jami naqd kirim)
    - total_cash_expense (jami naqd chiqim)
    - expected_cash (kutilayotgan naqd pul: starting_cash + total_cash_income - total_cash_expense)
    - actual_cash (kassadagi bor pul / sanalgan naqd pul)
    - difference (farq: actual_cash - expected_cash)
    - non_cash_income (karta, hisob raqam, boshqa elektron to'lovlar)
    - payment_methods_summary (barcha to'lov turlari va nasiya bo'yicha tushumlar)
    - payment_methods_details (har bir to'lov usuli bo'yicha kirim, chiqim va sof balans)
    - sales_count (savdolar soni)
    - total_sales_amount (jami savdolar summasi)
    - total_debt_amount (jami nasiya / qarzga berilgan savdolar)
    """
    starting_cash = Decimal(str(shift.starting_cash or 0))
    
    start_time = shift.opened_at
    end_time = shift.closed_at if shift.closed_at else timezone.now()

    # Cash flows linked to this shift OR within shift time for this user
    flows_qs = CashFlow.objects.filter(
        Q(shift=shift) |
        Q(sale__shift=shift) |
        Q(worker_transaction__shift=shift) |
        Q(user=shift.user, datetime__gte=start_time, datetime__lte=end_time)
    ).select_related('payment_method', 'client', 'sale').distinct()

    # Sales during shift
    sales_qs = Sale.objects.filter(
        Q(shift=shift) |
        Q(user=shift.user, datetime__gte=start_time, datetime__lte=end_time)
    ).distinct()

    sales_count = sales_qs.count()
    sales_agg = sales_qs.aggregate(
        total=Sum('total_amount'),
        paid=Sum('paid_amount'),
        debt=Sum('debt_amount')
    )
    total_sales_amount = Decimal(str(sales_agg['total'] or 0))
    total_paid_amount = Decimal(str(sales_agg['paid'] or 0))
    total_debt_amount = Decimal(str(sales_agg['debt'] or 0))

    cash_sale_income = Decimal('0.00')
    cash_debt_income = Decimal('0.00')
    other_cash_income = Decimal('0.00')
    total_cash_expense = Decimal('0.00')
    non_cash_income = Decimal('0.00')
    non_cash_expense = Decimal('0.00')

    # Methods tracking dict: { name: { 'income': Decimal, 'expense': Decimal, 'is_cash': bool } }
    methods_data = {}
    
    # Pre-populate all active payment methods
    for pm in PaymentMethod.objects.all():
        pm_title = pm.name.capitalize()
        methods_data[pm_title] = {
            'id': pm.id,
            'name': pm.name,
            'title': pm_title,
            'income': Decimal('0.00'),
            'expense': Decimal('0.00'),
            'is_cash': is_cash_method(pm)
        }

    for flow in flows_qs:
        amt = Decimal(str(flow.amount or 0))
        pm = flow.payment_method
        is_cash = is_cash_method(pm)
        pm_title = pm.name.capitalize() if pm else ("Naqd pul" if is_cash else "Elektron to'lov")

        if pm_title not in methods_data:
            methods_data[pm_title] = {
                'id': pm.id if pm else None,
                'name': pm.name if pm else pm_title,
                'title': pm_title,
                'income': Decimal('0.00'),
                'expense': Decimal('0.00'),
                'is_cash': is_cash
            }

        if flow.transaction_type == 'INCOME':
            methods_data[pm_title]['income'] += amt
            if is_cash:
                if flow.category == 'SALE':
                    cash_sale_income += amt
                elif flow.category == 'DEBT':
                    cash_debt_income += amt
                else:
                    other_cash_income += amt
            else:
                non_cash_income += amt

        elif flow.transaction_type == 'EXPENSE':
            methods_data[pm_title]['expense'] += amt
            if is_cash:
                total_cash_expense += amt
            else:
                non_cash_expense += amt

    total_cash_income = cash_sale_income + cash_debt_income + other_cash_income
    expected_cash = starting_cash + total_cash_income - total_cash_expense

    # Keep OPEN shift expected_cash synchronized in database
    if shift.status == 'OPEN':
        if shift.expected_cash != expected_cash:
            shift.expected_cash = expected_cash
            shift.save(update_fields=['expected_cash'])
        actual_cash = Decimal(str(shift.actual_cash or 0))
        difference = actual_cash - expected_cash if shift.actual_cash else Decimal('0.00')
    else:
        actual_cash = Decimal(str(shift.actual_cash or 0))
        difference = Decimal(str(shift.difference or 0))

    # Build simplified summary map and detailed list
    payment_methods_summary = {}
    payment_methods_details = []

    for m_title, m_info in methods_data.items():
        inc = m_info['income']
        exp = m_info['expense']
        net = inc - exp
        payment_methods_summary[m_title] = float(inc)
        payment_methods_details.append({
            'id': m_info['id'],
            'name': m_info['name'],
            'title': m_title,
            'is_cash': m_info['is_cash'],
            'income': float(inc),
            'expense': float(exp),
            'net': float(net)
        })

    # Add Nasiya / Qarz to payment methods summary if sales debt exists
    if total_debt_amount > 0:
        debt_title = "Nasiya (Qarz)"
        payment_methods_summary[debt_title] = float(total_debt_amount)
        payment_methods_details.append({
            'id': 'debt',
            'name': 'nasiya',
            'title': debt_title,
            'is_cash': False,
            'income': float(total_debt_amount),
            'expense': 0.0,
            'net': float(total_debt_amount),
            'is_debt': True
        })

    # Duration calculation
    duration_seconds = int((end_time - start_time).total_seconds()) if start_time else 0
    hours = duration_seconds // 3600
    minutes = (duration_seconds % 3600) // 60
    if hours > 0:
        duration_str = f"{hours} soat {minutes} daqiqa"
    else:
        duration_str = f"{minutes} daqiqa"

    return {
        'shift_id': shift.id,
        'user_id': shift.user_id,
        'user_name': shift.user.get_full_name() or shift.user.username,
        'user_phone': shift.user.phone_number,
        'status': shift.status,
        'opened_at': shift.opened_at.isoformat() if shift.opened_at else None,
        'closed_at': shift.closed_at.isoformat() if shift.closed_at else None,
        'duration_str': duration_str,
        'notes': shift.notes or '',
        'starting_cash': float(starting_cash),
        'cash_sale_income': float(cash_sale_income),
        'cash_debt_income': float(cash_debt_income),
        'other_cash_income': float(other_cash_income),
        'total_cash_income': float(total_cash_income),
        'total_cash_expense': float(total_cash_expense),
        'expected_cash': float(expected_cash),
        'actual_cash': float(actual_cash),
        'difference': float(difference),
        'non_cash_income': float(non_cash_income),
        'non_cash_expense': float(non_cash_expense),
        'payment_methods_summary': payment_methods_summary,
        'payment_methods_details': payment_methods_details,
        'sales_count': sales_count,
        'total_sales_amount': float(total_sales_amount),
        'total_paid_amount': float(total_paid_amount),
        'total_debt_amount': float(total_debt_amount),
    }
