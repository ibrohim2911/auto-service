from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from decimal import Decimal
from .models import Sale, Debt, CashFlow, ClientTransaction, WorkerTransaction, Client


@receiver(post_delete, sender=ClientTransaction)
def cleanup_client_transaction_cashflow(sender, instance, **kwargs):
    if instance.cashflow_id:
        try:
            CashFlow.objects.filter(id=instance.cashflow_id).delete()
        except Exception:
            pass


@receiver(post_delete, sender=WorkerTransaction)
def cleanup_worker_transaction_cashflow(sender, instance, **kwargs):
    if instance.cashflow_id:
        try:
            CashFlow.objects.filter(id=instance.cashflow_id).delete()
        except Exception:
            pass


@receiver(post_save, sender=Sale)
def sync_sale_debts(sender, instance, created, **kwargs):
    """
    Keep Debt records in sync with Sale debt_amount and paid_amount.
    Ensures corporate and individual client debt records stay consistent on updates.
    """
    if created:
        return

    debt = Decimal(str(instance.debt_amount or 0))
    paid = Decimal(str(instance.paid_amount or 0))

    linked_debt = instance.debts.first()
    if linked_debt:
        if debt <= Decimal('0.001'):
            linked_debt.paid_amount = linked_debt.amount
            linked_debt.status = 'PAID'
            linked_debt.save(update_fields=['paid_amount', 'status'])
        else:
            linked_debt.paid_amount = min(linked_debt.amount, paid)
            linked_debt.status = 'PARTIAL' if paid > Decimal('0.001') else 'UNPAID'
            if instance.due_date:
                linked_debt.due_date = instance.due_date
                linked_debt.save(update_fields=['paid_amount', 'status', 'due_date'])
            else:
                linked_debt.save(update_fields=['paid_amount', 'status'])


@receiver(post_delete, sender=Sale)
def cleanup_sale_relations(sender, instance, **kwargs):
    """
    When a Sale is deleted, cleanly remove associated Debts, CashFlows, and ClientTransactions.
    """
    try:
        instance.debts.all().delete()
    except Exception:
        pass
    try:
        instance.payments.all().delete()
    except Exception:
        pass
    try:
        instance.client_payments.all().delete()
    except Exception:
        pass
