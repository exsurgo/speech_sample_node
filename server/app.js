/**
 * Cloud Speech API streaming example for Node.js using gRPC.
 *
 * This file runs the WebSockets server, handles messages from the client and
 * acts as a middleperson between the client and the Cloud Speech API service.
 */
'use strict';

var cors = require('cors');
var express = require('express');
var http = require('http');
var request = require('request');

var app = express();

// Enable CORS for the server
app.use(cors());

// Create the HTTP server
var socketServer = http.createServer(app);

// Attach Socket.IO to the socket server
var io = require('socket.io')(socketServer);

// Create a default home page to return the IP of this virtual machine
app.get('/', function(req, res) {
  var host = req.headers.host;

  // Show the IP address on the screen
  getExternalIp(function(externalIp) {
    res.status(200).send(externalIp);
  });
});

// When someone connects on WebSockets
io.on('connection', function(socket) {
  // Create the server
  var cloudSpeechApi = require('./cloud-speech-api-server')();
  var recording = false;

  // When client wants to start/stop recording
  socket.on('recording', function(parameters) {
    if (parameters.action === 'start') {
      // Start the service
      cloudSpeechApi.startRecording(parameters.options, function(status) {
        // Set whether we're ready to record or not
        recording = status.recording;

        if (status.type === 'data') {
          socket.emit('recordingData', {
            recording: status.recording,
            data: status.data,
            error: status.error
          });
        } else if (status.type === 'status') {
          // Let the client know
          socket.emit('recordingStatusChange', {
            recording: status.recording,
            error: status.error
          });
        } else if (status.type === 'error') {
          socket.emit('recordingError', {
            recording: status.recording,
            error: status.error
          });
        }
      });
    } else if (parameters.action === 'stop') {
      // Stop the service
      cloudSpeechApi.stopRecording();

      // We've stopped recording
      recording = false;

      // Let the client know
      socket.emit('recordingStatus', {
        recording: recording,
        error: null
      });
    }
  });

  // When the client sends a file to recognise
  socket.on('recogniseFile', function(audioData, parameters) {
    // Pass the data along
    cloudSpeechApi.recogniseFile(audioData, parameters, function(response) {
      // If it was a success
      if (response.success) {
        socket.emit('recordingData', {
          data: response.data,
          error: response.error
        });
      } else {
        // Otherwise return the error
        socket.emit('recordingError', {
          error: response.error
        });
      }
    });
  });

  // When the client disconnects
  socket.on('disconnect', function() {
    // Stop the streaming client
    cloudSpeechApi.stopRecording();

    // We've stopped recording
    recording = false;
  });

  // When we receive audio data from the client
  socket.on('data', function(audioData) {
    // Only pass through the audio data if we're meant to be recording
    if (recording) {
      var response = cloudSpeechApi.recognise(audioData);
    }
  });
});

/**
 * Returns external IP of this virtual machine.
 *
 * In order to use websockets on App Engine, you need to connect directly to
 * application instance using the instance's public external IP. This IP can
 * be obtained from the metadata server.
 *
 * @param {function} cb Callback to return the IP address to.
 */
function getExternalIp(cb) {
  var options = {
    url: 'http://metadata/computeMetadata/v1/' +
         '/instance/network-interfaces/0/access-configs/0/external-ip',
    headers: {
      'Metadata-Flavor': 'Google'
    }
  };

  request(options, function(err, resp, body) {
    if (err || resp.statusCode !== 200) {
      // console.log('Error while talking to metadata server, assuming localhost');
      return cb('localhost');
    }
    return cb(body);
  });
}

// Start the websocket server
socketServer.listen('8080', function() {
  console.log('Websocket server listening on port %s',
              socketServer.address().port);
});
