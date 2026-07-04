from django.urls import path

from . import chat_views

urlpatterns = [
    path('threads/', chat_views.ChatThreadListCreateView.as_view(), name='chat-thread-list'),
    path('threads/<int:pk>/messages/', chat_views.ThreadMessageCreateView.as_view(), name='chat-message-create'),
    path('threads/<int:pk>/resolve/', chat_views.ThreadResolveView.as_view(), name='chat-thread-resolve'),
    path('rooms/', chat_views.ChatRoomListCreateView.as_view(), name='chat-room-list'),
    path('rooms/<str:room_name>/messages/', chat_views.ChatRoomMessagesView.as_view(), name='chat-room-messages'),
]
