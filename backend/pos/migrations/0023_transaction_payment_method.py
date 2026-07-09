from django.db import migrations, models


def backfill_payment_method(apps, schema_editor):
    """Seed each existing Transaction from its Order's current payment_method."""
    Transaction = apps.get_model('pos', 'Transaction')
    for txn in Transaction.objects.select_related('order').iterator():
        pm = txn.order.payment_method or ''
        if pm:
            txn.payment_method = pm
            txn.save(update_fields=['payment_method'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0022_cashaccount'),
    ]

    operations = [
        migrations.AddField(
            model_name='transaction',
            name='payment_method',
            field=models.CharField(blank=True, choices=[('CASH', 'Cash'), ('GCASH', 'GCash')], max_length=20),
        ),
        migrations.RunPython(backfill_payment_method, noop),
    ]
