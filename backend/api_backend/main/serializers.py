# serializers.py
from rest_framework import serializers
from .models import Game, Match

class GameSerializer(serializers.ModelSerializer):
    class Meta:
        model = Game
        fields = '__all__'  # You can also specify specific fields like ('id', 'name', 'no_of_players')



class MatchSerializer(serializers.ModelSerializer):
    game = GameSerializer(read_only=True) 
    players = serializers.SerializerMethodField()
    class Meta:
        model = Match
        fields = '__all__'  # You can also specify specific fields like ('id', 'name', 'no_of_players')

    def get_players(self, obj):
        # Get the players as a list of [id, username]
        return [[player.id, player.username] for player in obj.players.all()]