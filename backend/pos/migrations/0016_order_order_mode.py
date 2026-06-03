from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0015_rawmaterialsnapshot'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='order_mode',
            field=models.CharField(
                choices=[('REGULAR', 'Regular'), ('EMPLOYEE', 'Employee'), ('WASTE', 'Waste')],
                default='REGULAR',
                max_length=20,
            ),
        ),
    ]
