from django.urls import path
from . import views

urlpatterns = [
    path('user_details/', views.user_details, name='user_details'),
    path('create_user/', views.create_user, name='create_user'),
    path('match/create_match/', views.create_match, name='create_match'),
    path('games/', views.GameListAPIView.as_view(), name='game-list'),
    path('games/<int:id>/', views.GameDetailAPIView.as_view(), name='game-detail'),
    path('match/<str:id>/', views.MatchDetailAPIView.as_view(), name='match-detail'),
    path('games/<int:game_id>/users/', views.get_connected_users, name='connected_users'),
]