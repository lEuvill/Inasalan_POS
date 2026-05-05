from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0004_add_voided_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='slip_number',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
    ]
