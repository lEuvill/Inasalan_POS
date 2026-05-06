from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0011_rawmaterial'),
    ]

    operations = [
        migrations.AddField(
            model_name='rawmaterial',
            name='stock_qty',
            field=models.DecimalField(decimal_places=3, default=0, max_digits=10),
        ),
        migrations.CreateModel(
            name='ProductIngredient',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('qty_per_serving', models.DecimalField(decimal_places=3, max_digits=10)),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='recipe_ingredients', to='pos.product')),
                ('raw_material', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='used_in', to='pos.rawmaterial')),
            ],
            options={
                'ordering': ['raw_material__name'],
                'unique_together': {('product', 'raw_material')},
            },
        ),
    ]
