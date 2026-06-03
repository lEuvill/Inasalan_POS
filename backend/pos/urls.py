from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProductViewSet, OrderViewSet, TransactionViewSet, TableViewSet,
    RawMaterialViewSet, ProductIngredientViewSet, RawMaterialSnapshotViewSet,
    ExpenseViewSet, CashAccountViewSet,
    SyncPushView, SyncPullView, BulkImportView,
)

router = DefaultRouter()
router.register('products', ProductViewSet)
router.register('orders', OrderViewSet)
router.register('transactions', TransactionViewSet)
router.register('tables', TableViewSet)
router.register('raw-materials', RawMaterialViewSet)
router.register('product-ingredients', ProductIngredientViewSet)
router.register('raw-material-snapshots', RawMaterialSnapshotViewSet)
router.register('expenses', ExpenseViewSet)
router.register('cash-accounts', CashAccountViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('sync/push/', SyncPushView.as_view()),
    path('sync/pull/', SyncPullView.as_view()),
    path('import/<str:table>/', BulkImportView.as_view()),
]
