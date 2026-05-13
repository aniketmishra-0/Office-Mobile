import os
import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import sqlite3

# This script is a scratchpad to figure out if we can use Drive API to check edit access
def get_token():
    conn = sqlite3.connect("backend/forms.db")
    c = conn.cursor()
    c.execute("SELECT access_token, refresh_token FROM oauth_tokens LIMIT 1")
    row = c.fetchone()
    if row:
        return {"access_token": row[0], "refresh_token": row[1]}
    return None

token = get_token()
if token:
    creds = Credentials(
        token=token["access_token"],
        refresh_token=token["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id="dummy",
        client_secret="dummy",
    )
    # We will just print if we have the token
    print("Got token")
