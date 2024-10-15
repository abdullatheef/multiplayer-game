import jwt
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.conf import settings
from django.contrib.auth.models import User

class JWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        token = request.COOKIES.get('X-Session-Key') or request.headers.get('X-Session-Key')
        if not token:
            return None

        try:
            # Decode the token using the same secret used in Flask
            decoded_token = jwt.decode(token, settings.JWT_SECRET, algorithms=['HS256'])
            email = decoded_token.get('email')
            name = decoded_token.get('name')

            if not email:
                raise AuthenticationFailed('Token does not contain user_id.')

            # Find the user based on the user_id
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                user = User.objects.create(email=email, username=name)
                
            return (user, None)  # return the user and None for the authentication token

        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed('Token has expired.')
        except jwt.InvalidTokenError:
            raise AuthenticationFailed('Invalid token.')
