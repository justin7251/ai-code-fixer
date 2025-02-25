
# Set the config
firebase functions:config:set session.secret_key="your-secret-key" github.client_id="your-client-id" github.client_secret="your-client-secret"

# Deploy the functions
firebase deploy --only functions
