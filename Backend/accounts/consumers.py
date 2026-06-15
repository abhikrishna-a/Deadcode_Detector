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
