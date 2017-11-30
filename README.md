# Cloud Speech API streaming example

Frontend and backend for Cloud Speech API using Node.js over gRPC.

It reads microphone data using getUserMedia on the frontend, streams the raw audio data to the backend over WebSockets, and has callbacks setup so you can process the data however you want.

The frontend and backend are separated because they don't have to be on the same URL, the server has CORS enabled.

## Example

[Live example](https://storage.googleapis.com/zoo-tech-prototypes/cloud-speech-api-streaming/index.html).

## How to use

You'll need to run a HTTPS server in order to make this work locally.

**1. Enable firewall rules**

Add a new rule for your Cloud Console project.

Note: for this you'll need to have gcloud (`$ npm install gcloud`) installed, and have it pointing to a project already.

```bash
gcloud compute firewall-rules create default-allow-websockets \
      --allow tcp:443:8080 \
      --target-tags cloudspeechstreaming \
      --description "Allow websocket traffic on port 443"
```

This maps HTTPS to a custom port (8080) which is running the Socket.IO service.

**2. Change stuff**

Change the Socket.IO URLs in `client/index.html` and `client/app.js`

Run `npm install` in the server directory to get everything that's required.

Replace `credentials.json` with your own version.

Export the credentials file so gcloud can find it: 
`$ export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json`

**3. Run it**

Run the client and server in different tabs.

Note: App Engine Flexible does not support secure WebSockets connections, but Socket.IO defaults to HTTP polling so it still works over HTTPS. This is not suitable for production though, you should use a real WebSockets connection.

## Things to note

* Replace credentials.json with your own version, this one is part of the ZOO Tech External project (which you have access to)