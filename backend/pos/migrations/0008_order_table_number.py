from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0007_order_type_payment'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='table_number',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
    ]
