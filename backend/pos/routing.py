from django.urls import path
from .consumers import PosConsumer

websocket_urlpatterns = [
    path('ws/pos/', PosConsumer.as_asgi()),
]
