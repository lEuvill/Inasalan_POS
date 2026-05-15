from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0017_rawmaterial_category'),
    ]

    operations = [
        migrations.AlterField(
            model_name='order',
            name='order_mode',
            field=models.CharField(
                choices=[('REGULAR', 'Regular'), ('EMPLOYEE', 'Employee'), ('WASTE', 'Waste'), ('BULK', 'Bulk')],
                default='REGULAR',
                max_length=20,
            ),
        ),
    ]
