import uuid
import requests
import urllib.parse

GOOGLE_CLIENT_ID = '108451919672.apps.googleusercontent.com'
GOOGLE_CLIENT_SECRET = '80NVc0Zt80SwPwkujE6gi1Np'
GOOGLE_REDIRECT_URL = 'https://headvstail.com/gauth/'
# GOOGLE_REDIRECT_URL = 'https://pipes-deep-childrens-tire.trycloudflare.com/gauth/'
GOOGLE_SCOPE = 'profile email'
GOOGLE_GRANT_TYPE = 'authorization_code'
GOOGLE_OAUTH2_URL = 'https://accounts.google.com/o/oauth2/auth?'


def get_redirect_url():
    g_url = GOOGLE_OAUTH2_URL + \
    'client_id=' + GOOGLE_CLIENT_ID +\
    '&scope=' + GOOGLE_SCOPE +\
    '&response_type=code' +\
    '&redirect_uri=' + GOOGLE_REDIRECT_URL +\
    '&state=' + str(uuid.uuid4())
    return g_url


def get_details(code, state):
    code = urllib.parse.unquote(code)
    resp = requests.post(
        url='https://www.googleapis.com/oauth2/v3/token',
        data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GOOGLE_REDIRECT_URL,
            "grant_type": GOOGLE_GRANT_TYPE
        }
    )
    access_token = resp.json().get('access_token')
    if access_token:
        user_info_url = 'https://www.googleapis.com/oauth2/v1/userinfo'
        headers = {
            'Authorization': f'Bearer {access_token}'
        }
        user_info_response = requests.get(user_info_url, headers=headers)
        user_info = user_info_response.json()
        print(user_info)
        email = user_info["email"]
        name = f'{user_info.get("given_name", "")} {user_info.get("family_name", "")}'
        # resp1 = requests.get("https://www.googleapis.com/plus/v1/people/me?access_token=" +  access_token)
        # print(resp1.json())
        # email = resp1.json()["emails"][0]["value"]
        # username = resp1.json().get("displayName")

    return {"email": email, "name": name}

