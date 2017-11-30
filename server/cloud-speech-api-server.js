/**
 * Cloud Speech API streaming example for Node.js using gRPC.
 *
 * This file takes care of the Cloud Speech API service. It creates the
 * service, handles the audio data processing, and responds back to the
 * client/Node.js server as required.
 */
module.exports = CloudSpeechApi;

/**
 * Cloud Speech API streaming module.
 *
 * @constructor
 */
function CloudSpeechApi() {
  'use strict';

  if (!(this instanceof CloudSpeechApi)) {
    return new CloudSpeechApi();
  }

  // Imports
  var googleAuth = require('google-auto-auth');
  var googleProtoFiles = require('google-proto-files');
  var grpc = require('grpc');
  var path = require('path');

  // Load the speech protos
  var PROTO_ROOT_DIR = googleProtoFiles('..');
  var protoDescriptor = grpc.load({
    root: PROTO_ROOT_DIR,
    file: path.relative(PROTO_ROOT_DIR, googleProtoFiles.speech.v1beta1)
  }, 'proto', {
    binaryAsBase64: true,
    convertFieldsToCamelCase: true
  });
  var speechProto = protoDescriptor.google.cloud.speech.v1beta1;

  // Client-specific
  var speechClient = null;
  var initialRequest = true; // Do we need to send the initial request?
  var streamingOptions = {
    config: {
      encoding: 'LINEAR16',
      sampleRate: 41000,
      languageCode: 'en-US',
      profanityFilter: true,
      speechContext: null
    },
    interimResults: true,
    singleUtterance: false
  };
  var nonStreamingOptions = {
    encoding: 'LINEAR16',
    sampleRate: 16000,
    languageCode: 'en-US',
    continuous: false,
    // speechContext: null, // Missing from proto (bug?)
    enableEndpointerEvents: false // Default is false anyway
  };

  /**
   * Creates the Cloud Speech API service.
   *
   * @param {!function} callback Callback function when it's done.
   */
  function getSpeechService(callback) {
    // Create the auth client
    var googleAuthClient = googleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    googleAuthClient.getAuthClient(function(err, authClient) {
      // Did we have an error? Report back
      if (err) {
        return callback(err);
      }

      // Create the credentials
      var credentials = grpc.credentials.combineChannelCredentials(
        grpc.credentials.createSsl(),
        grpc.credentials.createFromGoogleCredential(authClient)
      );

      // Create the stubby
      return callback(new speechProto.Speech('speech.googleapis.com',
                                             credentials));
    });
  }

  /**
   * Recognises a file.
   *
   * Technically this isn't the streaming version of the API, but including
   * support for it for completeness.
   *
   * @param {!string} audioData Base64 encoding string of audio data to be
   * processed.
   * @param {?Object<string>} parameters Optional parameters to send through.
   * @param {function} callback Callback function when there's a response.
   */
  this.recogniseFile = function(audioData, parameters, callback) {
    var initialRequest = nonStreamingOptions;

    // Do we have any custom parameters? If so, set them
    if (parameters) {
      var requestKeys = Object.keys(initialRequest);
      for (var p = 0; p < requestKeys.length; p++) {
        if (parameters.hasOwnProperty(requestKeys[p])) {
          initialRequest[requestKeys[p]] = parameters[requestKeys[p]];
        }
      }
    }

    // Build the request
    var request = {
      initialRequest: new speechProto.InitialRecognizeRequest(initialRequest),
      audioRequest: new speechProto.AudioRequest({
        content: audioData
      })
    };

    // Create a speech service
    getSpeechService(function(speechService) {
      // Send the request
      speechService.nonStreamingRecognize(request, function(error, response) {

        // If there's an error, return it
        if (error) {
          callback({
            success: false,
            error: error
          });
        } else {
          // Else return the data
          callback({
            success: true,
            data: response.responses[0].results,
            error: error
          });
        }
      });
    });
  };

  /**
   * Starts recording.
   *
   * This creates the speech service, and then returns its status when
   * finished.
   *
   * @param {?Object<string>} options Streaming options, e.g. sample rate.
   * @param {!function} callback Function to call when ready to accept
   * streaming audio data.
   */
  this.startRecording = function(options, callback) {
    getSpeechService(function(speechService) {
      // Set custom parameters if there are any
      if (options) {
        var optionsKeys = Object.keys(options);
        for (var i = 0; i < optionsKeys.length; i++) {
          if (streamingOptions.hasOwnProperty(optionsKeys[i])) {
            if (typeof options[optionsKeys[i]] === 'object') {
              var innerOptionsKeys = Object.keys(options[optionsKeys[i]]);
              var innerOptions = options[optionsKeys[i]];
              for (var oi = 0; oi < innerOptionsKeys.length; oi++) {
                if (streamingOptions[optionsKeys[i]].hasOwnProperty(innerOptionsKeys[oi])) {
                  streamingOptions[optionsKeys[i]][innerOptionsKeys[oi]] = innerOptions[innerOptionsKeys[oi]];
                }
              }
            } else {
              if (streamingOptions.hasOwnProperty(optionsKeys[i])) {
                streamingOptions[optionsKeys[i]] = options[optionsKeys[i]];
              }  
            }
          }
        }
      }

      // Start the speech service
      speechClient = speechService.streamingRecognize();

      // Reset, so we send the initial request
      initialRequest = true;

      // If we get any errors
      speechClient.on('error', function(error) {
        callback({
          type: 'error',
          recording: false,
          error: error
        });
      });

      // When we get a result
      speechClient.on('data', function(response) {
        if (response.error) {
          callback({
            type: 'error',
            recording: false,
            error: response.error
          });
        } else {
          if (response.results && response.results.length) {
            callback({
              type: 'data',
              data: response.results,
              recording: true,
              error: response.error
            });
          }
        }
      });

      // When we're done streaming
      speechClient.on('end', function() {
        callback({
          type: 'status',
          recording: false,
          error: null
        });
      });

      // We're all set, trigger the callback
      callback({
        type: 'status',
        recording: true,
        error: null
      });
    });
  };

  /**
   * Recognises streaming audio data.
   *
   * Passes the audio data through to the Cloud Speech API, with an initial
   * request to set the right metadata (sample rate, etc).
   *
   * @param {!ArrayBuffer} audioData Arraybuffer of raw audio data.
   */
  this.recognise = function(audioData) {
    // If this is the first request to the API, send the metadata
    if (initialRequest) {
      speechClient.write({
        streamingConfig: streamingOptions
      });

      initialRequest = false;
    }

    speechClient.write({
      audioContent: audioData
    });
  };

  /**
   * Stops recording.
   *
   * This also closes the speech service if it's currently open.
   */
  this.stopRecording = function() {
    // Stop the speech client if it's open
    if (speechClient) {
      speechClient.end();
    }

    // Reset the speech client
    speechClient = null;
  };
}
