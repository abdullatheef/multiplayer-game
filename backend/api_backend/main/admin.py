from django.contrib import admin
from .models import Game, Match, ImageToText, MatchRequest

class GameAdmin(admin.ModelAdmin):
    list_display = ('name', 'no_of_players')
    search_fields = ('name',)

class MatchAdmin(admin.ModelAdmin):
    list_display = ('game', 'started_at', 'ended_at', 'winner')
    search_fields = ('game__name',)
    filter_horizontal = ('players',)

admin.site.register(Game, GameAdmin)
admin.site.register(Match, MatchAdmin)
admin.site.register(ImageToText)
admin.site.register(MatchRequest)
