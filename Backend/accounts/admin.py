from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser
from . import chat_models as models


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    # Columns shown in the user list view
    list_display = (
        'username', 'email', 'role', 'is_mfa_enabled',
        'is_staff', 'is_active', 'date_joined'
    )

    # Clickable column for quick filtering
    list_display_links = ('username', 'email')

    # Right sidebar filters
    list_filter = ('role', 'is_mfa_enabled', 'is_staff', 'is_active')

    # Allow role to be edited directly from the list view (inline edit)
    list_editable = ('role',)

    # Search by these fields
    search_fields = ('username', 'email')

    # Default sort
    ordering = ('-date_joined',)

    # Add role and MFA fields into the user detail/edit form
    # Extends the default UserAdmin fieldsets
    fieldsets = UserAdmin.fieldsets + (
        ('GhostCode Settings', {
            'fields': ('role', 'is_mfa_enabled', 'mfa_secret'),
        }),
    )

    # Fields shown when creating a new user via admin
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('GhostCode Settings', {
            'fields': ('role',),
        }),
    )

    # Make mfa_secret read-only so admins can see it but not accidentally corrupt it
    readonly_fields = ('mfa_secret',)


@admin.register(models.IssueThread)
class IssueThreadAdmin(admin.ModelAdmin):
    list_display = ('id', 'analysis_id', 'filename', 'issue_id', 'created_by', 'resolved', 'created_at')
    list_filter = ('resolved', 'created_by')
    search_fields = ('filename', 'analysis_id', 'issue_id')
    ordering = ('-created_at',)


@admin.register(models.ThreadMessage)
class ThreadMessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'thread_id', 'author', 'is_ai_hint', 'created_at')
    list_filter = ('is_ai_hint', 'author')
    ordering = ('-created_at',)


@admin.register(models.ChatRoom)
class ChatRoomAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'scan_folder', 'created_by', 'created_at')
    search_fields = ('name',)
    ordering = ('-created_at',)


@admin.register(models.RoomMessage)
class RoomMessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'room', 'author', 'created_at')
    list_filter = ('author',)
    ordering = ('-created_at',)