import json
import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async

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

    async def junior_analysis_complete(self, event):
        await self.send_json({
            'type': 'junior.analysis_complete',
            'submission_id': event.get('submission_id'),
            'file_name': event.get('file_name'),
            'result': event.get('result'),
        })

    async def junior_analysis_failed(self, event):
        await self.send_json({
            'type': 'junior.analysis_failed',
            'submission_id': event.get('submission_id'),
            'file_name': event.get('file_name'),
        })
