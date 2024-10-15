from django.db import models
from django.contrib.auth.models import User
import uuid

class Game(models.Model):
    name = models.CharField(max_length=100)
    slug = models.CharField(max_length=100)
    no_of_players = models.IntegerField()
    description = models.TextField()
    square_image_url = models.CharField(max_length=250)
    image_url = models.CharField(max_length=250)
    video_url = models.CharField(max_length=250)
    connection = models.CharField(max_length=100)
    live = models.CharField(max_length=100)


    def __str__(self):
        return self.name

class MatchRequest(models.Model):
    uuid = models.UUIDField(default=uuid.uuid4)
    game = models.ForeignKey(Game, on_delete=models.CASCADE)  # ForeignKey to Game model
    match_type = models.CharField(choices=[('1v1', '1v1'), ('random', 'random')], max_length=10)
    source = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="request_source")  # Unique related_name for winner
    target = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="request_target")  # Unique related_name for winner
    created_at = models.DateTimeField(auto_now_add=True)

class ImageToText(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    game = models.ForeignKey(Game, on_delete=models.CASCADE) 
    image = models.CharField(max_length=100)
    text = models.TextField()


class ImageToTextMatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    match_request = models.ForeignKey(MatchRequest, on_delete=models.CASCADE)
    imagetotext = models.ForeignKey(ImageToText, on_delete=models.CASCADE)
    source_ready = models.BooleanField(default=False)
    target_ready = models.BooleanField(default=False)
    winner = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)


class MatchAccept(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE)  # ForeignKey to Game model
    source = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="accept_source")  # Unique related_name for winner
    target = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="accept_target")  # Unique related_name for winner
    created_at = models.DateTimeField(auto_now_add=True)

class Match(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    game = models.ForeignKey(Game, on_delete=models.CASCADE)  # ForeignKey to Game model
    players = models.ManyToManyField(User, related_name='matches_as_player')  # Unique related_name for players
    winner = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='matches_as_winner')  # Unique related_name for winner
    started_at = models.DateTimeField(auto_now_add=True)  # Automatically set the field to now when the match starts
    ended_at = models.DateTimeField(null=True, blank=True)  # Nullable field for when the match ends

    def __str__(self):
        return f"Match of {self.game.name} started at {self.started_at}"
