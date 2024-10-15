from flask import Flask, jsonify, request
from google_auth import get_redirect_url, get_details
import jwt
import datetime
import psycopg2
from psycopg2 import pool
from functools import wraps
import re
from flask_cors import CORS
import requests

DATABASE_CONFIG = {
    'dbname': 'auth',
    'user': 'abc',
    'password': '123',
    'host': 'localhost',
    'port': '5432'
}

JWT_SECRET = 'your_jwt_secret'
GAME_SERVICE_URL = 'http://localhost:8005'
connection_pool = psycopg2.pool.SimpleConnectionPool(1, 10, **DATABASE_CONFIG)

app = Flask(__name__)
CORS(app)

def is_valid_email(email):
    email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    return re.match(email_regex, email) is not None

def db_connection(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        conn = connection_pool.getconn()
        try:
            return f(conn, *args, **kwargs)
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        finally:
            connection_pool.putconn(conn)
    return decorated

@app.route('/')
def home():
    return "Hello, Flask!"

@db_connection
def manage_users(conn, email, name):
    if not is_valid_email(email):
        raise Exception("Invalid Email")
    
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM app_users WHERE email = %s", (email,))
        user = cursor.fetchone()
        if user is None:
            cursor.execute("INSERT INTO app_users (email, name) VALUES (%s, %s) RETURNING id", (email, name))
            user_id = cursor.fetchone()[0]
            conn.commit()
        else:
            user_id = user[0]
        token = jwt.encode({
            'user_id': user_id,
            'email': email,
            'name': name,
            'exp': datetime.datetime.now() + datetime.timedelta(days=365)  # Token expires in 1 year
        }, JWT_SECRET, algorithm='HS256')
        resp = requests.post(f'{GAME_SERVICE_URL}/main/create_user/', headers={'X-Session-Key': token})
        auth_user_id = resp.json()['id']
        token = jwt.encode({
            'user_id': auth_user_id,
            'auth_user_id': user_id,
            'email': email,
            'name': name,
            'exp': datetime.datetime.now() + datetime.timedelta(days=365)  # Token expires in 1 year
        }, JWT_SECRET, algorithm='HS256')
        response = jsonify({'status': 1, "data": token})
        response.set_cookie('X-Session-Key', token)
        response.set_cookie('cookie_key', "cookie_value")
        return response, 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/gauth', methods=['POST', 'GET'])
def gauth_url():
    if request.method == 'POST':
        data = request.get_json()
        code = data['code']
        state = data['state']
        user_details = get_details(code, state)
        return manage_users(**user_details)
    return jsonify({"status": 1, "data": get_redirect_url()})

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('X-Session-Key')  # Ensure this matches the header you're sending
        if not token:
            return jsonify({'error': 'Token is missing!'}), 403
        try:
            data = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            auth_user_id = data['auth_user_id']
            user_id = data['user_id']
            return f(user_id, auth_user_id, *args, **kwargs)
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired!'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token!'}), 401
    return decorated

@app.route('/me', methods=['GET'])
@token_required
@db_connection
def me(conn, user_id, auth_user_id):
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, name FROM app_users WHERE id = %s", (auth_user_id,))
        user = cursor.fetchone()

        if user is None:
            return jsonify({'error': 'User not found!'}), 404

        user_info = {
            'auth_user_id': auth_user_id,
            'user_id': user_id,
            'email': user[1],
            'name': user[2]
        }

        return jsonify(user_info), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5555)
