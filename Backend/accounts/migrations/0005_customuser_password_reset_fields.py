from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0004_rename_mfa_enabled_customuser_is_mfa_enabled")]
    operations = [
        migrations.AddField(model_name="customuser", name="password_reset_token",
            field=models.CharField(blank=True, max_length=64, null=True)),
        migrations.AddField(model_name="customuser", name="password_reset_token_created_at",
            field=models.DateTimeField(blank=True, null=True)),
    ]
