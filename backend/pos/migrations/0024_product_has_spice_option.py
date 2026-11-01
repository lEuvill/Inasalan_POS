from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('pos', '0023_transaction_payment_method'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='has_spice_option',
            field=models.BooleanField(default=False),
        ),
    ]
