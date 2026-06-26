import json
import logging
from datetime import datetime

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model

from .chat_models import ChatRoom, RoomMessage

UserModel = get_user_model()
logger = logging.getLogger(__name__)


class AnalysisConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.batch_id = self.scope['url_route']['kwargs']['batch_id']
        self.group_name = f'analysis_{self.batch_id}'

        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info('WebSocket connected: batch=%s user=%s', self.batch_id, user)

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content):
        pass

    async def analysis_progress(self, event):
        await self.send_json({
            'type': 'progress',
            'done': event['done'],
            'total': event['total'],
            'current_file': event['current_file'],
        })

    async def analysis_file_complete(self, event):
        await self.send_json({
            'type': 'file_complete',
            'filename': event['filename'],
            'document_id': event['document_id'],
            'analysis': event['analysis'],
            'source_content': event.get('source_content', ''),
            'scan_folder': event.get('scan_folder', ''),
            'scan_type': event.get('scan_type', 'single'),
        })

    async def analysis_file_error(self, event):
        await self.send_json({
            'type': 'file_error',
            'filename': event['filename'],
            'error': event['error'],
        })

    async def analysis_batch_complete(self, event):
        await self.send_json({
            'type': 'batch_complete',
        })


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return
        self.user_id = user.id
        self.group_name = f'notifications_user_{user.id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info('Notification WS connected: user=%s', user)

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content):
        pass

    async def new_chat_thread(self, event):
        await self.send_json({
            'type': 'new_chat_thread',
            'thread_id': event.get('thread_id'),
            'from_username': event.get('from_username'),
        })

    async def nightly_report_ready(self, event):
        await self.send_json({'type': 'nightly_report_ready'})

    async def junior_analysis_started(self, event):
        await self.send_json({
            'type': 'submission_update',
            'submission_id': event.get('submission_id'),
            'file_name': event.get('file_name'),
        })

    async def junior_analysis_complete(self, event):
        await self.send_json({
            'type': 'submission_update',
            'submission_id': event.get('submission_id'),
            'file_name': event.get('file_name'),
            'result': event.get('result'),
        })

    async def junior_analysis_failed(self, event):
        await self.send_json({
            'type': 'submission_update',
            'submission_id': event.get('submission_id'),
            'file_name': event.get('file_name'),
        })

    async def feedback_added(self, event):
        await self.send_json({
            'type': 'feedback_added',
            'submission_id': event.get('submission_id'),
            'file_name': event.get('file_name'),
            'feedback_id': event.get('feedback_id'),
            'line_start': event.get('line_start'),
            'line_end': event.get('line_end'),
            'reviewer_username': event.get('reviewer_username'),
        })


class ChatRoomConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'chat_{self.room_name}'

        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        logger.info('Chat WS connected: room=%s user=%s', self.room_name, user)

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive_json(self, content):
        action = content.get('action')
        user = self.scope['user']

        if action == 'send_message':
            msg_text = content.get('content', '').strip()
            if not msg_text:
                return

            msg = await self._save_message(self.room_name, user, msg_text)

            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'chat_message',
                    'id': msg.id,
                    'author_id': user.id,
                    'author_username': user.username,
                    'content': msg_text,
                    'created_at': msg.created_at.isoformat(),
                }
            )

        elif action == 'typing':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'user_typing',
                    'author_id': user.id,
                    'author_username': user.username,
                }
            )

        elif action == 'stop_typing':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'user_stop_typing',
                    'author_id': user.id,
                    'author_username': user.username,
                }
            )

    async def chat_message(self, event):
        await self.send_json({
            'type': 'chat_message',
            'id': event['id'],
            'author_id': event['author_id'],
            'author_username': event['author_username'],
            'content': event['content'],
            'created_at': event['created_at'],
        })

    async def user_typing(self, event):
        await self.send_json({
            'type': 'typing',
            'author_id': event['author_id'],
            'author_username': event['author_username'],
        })

    async def user_stop_typing(self, event):
        await self.send_json({
            'type': 'stop_typing',
            'author_id': event['author_id'],
            'author_username': event['author_username'],
        })

    @database_sync_to_async
    def _save_message(self, room_name, user, content):
        room, _ = ChatRoom.objects.get_or_create(
            name=room_name,
            defaults={'created_by': user},
        )
        return RoomMessage.objects.create(room=room, author=user, content=content)
