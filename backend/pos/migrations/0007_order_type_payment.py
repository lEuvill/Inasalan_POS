from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0006_product_output_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='order_type',
            field=models.CharField(
                blank=True,
                choices=[('DINE_IN', 'Dine In'), ('TAKE_OUT', 'Take Out'), ('DELIVERY', 'Delivery'), ('PICK_UP', 'Pick Up')],
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='order',
            name='payment_method',
            field=models.CharField(
                blank=True,
                choices=[('CASH', 'Cash'), ('GCASH', 'GCash')],
                max_length=20,
            ),
        ),
    ]
