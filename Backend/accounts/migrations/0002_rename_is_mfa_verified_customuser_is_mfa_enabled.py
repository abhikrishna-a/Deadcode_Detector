from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RenameField(
            model_name="customuser",
            old_name="is_mfa_verified",
            new_name="is_mfa_enabled",
        ),
    ]
