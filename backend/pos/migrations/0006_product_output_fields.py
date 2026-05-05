from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0005_order_slip_number'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='output_name',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='product',
            name='output_code',
            field=models.CharField(blank=True, max_length=50),
        ),
    ]
