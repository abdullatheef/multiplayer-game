from django.shortcuts import render
import jwt, json
# Create your views here.

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
import jwt
from rest_framework.exceptions import AuthenticationFailed
from django.conf import settings
from django.contrib.auth.models import User
from rest_framework import generics
from .models import Game, Match, MatchRequest, ImageToTextMatch, ImageToText
from .serializers import GameSerializer, MatchSerializer
import redis
redis_client = redis.StrictRedis(host=settings.REDIS_HOST, port=6379, db=0)
from django.http import JsonResponse


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_details(request):
    user = request.user
    return Response({
        'id': user.id,
        'username': user.username,
        'email': user.email
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def create_user(request):
    token = request.headers.get('X-Session-Key')
    if not token:
        return Response({})
    try:
        # Decode the token using the same secret used in Flask
        decoded_token = jwt.decode(token, settings.JWT_SECRET, algorithms=['HS256'])
        email = decoded_token.get('email')
        name = decoded_token.get('name')
        print(email, name)

        if not email:
            raise AuthenticationFailed('Token does not contain email.')

        # Find the user based on the user_id
        try:
            user = User.objects.get(email=email)
            return Response({
                'username': user.username,
                'email': user.email,
                'id': user.id
            })
        except User.DoesNotExist:
            user = User.objects.create(email=email, username=name)
            return Response({
                'username': user.username,
                'email': user.email,
                'id': user.id
            })

    except jwt.ExpiredSignatureError:
        raise AuthenticationFailed('Token has expired.')
    except jwt.InvalidTokenError:
        raise AuthenticationFailed('Invalid token.')




class GameListAPIView(generics.ListAPIView):
    queryset = Game.objects.all()  # Queryset to retrieve all Game objects
    serializer_class = GameSerializer  # Serializer to convert queryset into JSON
    permission_classes = [IsAuthenticated]


class GameDetailAPIView(generics.RetrieveAPIView):
    queryset = Game.objects.all()
    serializer_class = GameSerializer
    lookup_field = 'id'  # Use the 'id' field to look up the game
    permission_classes = [IsAuthenticated]


class MatchDetailAPIView(generics.RetrieveAPIView):
    queryset = Match.objects.all()
    serializer_class = MatchSerializer
    lookup_field = 'id'  # Use the 'id' field to look up the game
    permission_classes = [IsAuthenticated]

# views.py

# Connect to Redis
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_connected_users(request, game_id):
    # Redis key for the connected users in the game
    redis_key = f"GAME_{game_id}_CONNECTED_USERS"
    
    # Fetch members from Redis set
    user_data = redis_client.smembers(redis_key)
    
    # Prepare the list of users (id, name) by splitting the string
    users = []
    for user in user_data:
        user_str = user.decode("utf-8")  # Decode bytes to string
        user_id, user_name = user_str.split("---")
        users.append({
            'id': user_id,
            'name': user_name
        })
    
    # Return the list of users as JSON response
    return JsonResponse({'users': users})


def verify():
    pass

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_match(request):
    target_user_id = request.data.get('target_user_id', None)
    game_id = request.data.get('game_id', None)
    uuid = request.data.get('uuid', None)
    print(request.data)
    verify()

    match_request = MatchRequest.objects.get(uuid=uuid)
    if not match_request.source:
        if str(match_request.target_id) == str(target_user_id):
            match_request.source_id = request.user.id
        else:
            match_request.source_id = target_user_id
    if not match_request.target:
        if str(match_request.source_id) == str(target_user_id):
            match_request.target_id = request.user.id
        else:
            match_request.target_id = target_user_id
    match_request.save()
    match = Match.objects.create(id=uuid, game_id=game_id)
    match.players.add(*(target_user_id, request.user.id))

    token = request.headers.get('X-Session-Key')
    game = Game.objects.get(id=game_id)
    #if game.slug == 'imagetotext':
    create_imagetotext(game_id, match_request.id)
    message = {
        'event': 'redirect',
        'targetUserId': target_user_id,
        'token': token,
        'url': 'http://localhost:8000/%s/?id=%s' % (game.slug, uuid)
    }
    
    # Publish the message to a Redis channel (e.g., 'game_updates')
    redis_channel = 'game_requests'
    redis_client.publish(redis_channel, json.dumps(message))
    message['targetUserId'] = request.user.id
    redis_client.publish(redis_channel, json.dumps(message))
    # Return the list of users as JSON response



    return JsonResponse({})


def create_imagetotext(game_id, match_request):
    ImageToTextMatch.objects.create(
        match_request_id=match_request,
        imagetotext=ImageToText.objects.order_by('?').first()
    )