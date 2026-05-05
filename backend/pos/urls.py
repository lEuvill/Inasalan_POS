from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProductViewSet, OrderViewSet, TransactionViewSet,
    SyncPushView, SyncPullView,
)

router = DefaultRouter()
router.register('products', ProductViewSet)
router.register('orders', OrderViewSet)
router.register('transactions', TransactionViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('sync/push/', SyncPushView.as_view()),
    path('sync/pull/', SyncPullView.as_view()),
]
