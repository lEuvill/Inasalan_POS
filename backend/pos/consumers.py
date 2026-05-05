import json
from channels.generic.websocket import AsyncWebsocketConsumer

GROUP = 'pos_updates'


class PosConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add(GROUP, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(GROUP, self.channel_name)

    async def receive(self, text_data):
        # Android pushes sync events (NEW_ORDER, ORDER_STATUS_UPDATE) via WebSocket.
        # Re-broadcast to all clients (web dashboards, other Android devices).
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return
        await self.channel_layer.group_send(GROUP, {'type': 'pos.event', 'data': data})

    async def pos_event(self, event):
        await self.send(text_data=json.dumps(event['data']))
