/**
 * Cloud Speech API streaming example for Node.js using gRPC.
 *
 * This file creates a new Cloud Speech API client and handles the WebSockets
 * messages between the frontend and the Node.js server.
 */

/**
 * The Cloud Speech API client.
 *
 * @constructor
 * @param {!Object} socket Socket.IO socket for communicating with the server.
 * @param {?Array<function>} customCallbacks Callbacks for the API.
 */
function CloudSpeechApiClient(socket, customCallbacks) {

  // Colouring for developer console
  var devCssStyle = 'background: #90caf9; color: #fff; padding: 2px 5px;';
  var devCssPrefix = '%cCloud Speech API client';

  // Cross browser support for getUserMedia
  navigator.getUserMedia = navigator.getUserMedia ||
      navigator.webkitGetUserMedia || navigator.mozGetUserMedia ||
      navigator.msGetUserMedia;

  // Cross browser support for AudioContext
  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  var audioContext = null;

  // We're not recording right now
  var isRecording = false;

  // Callbacks for the API
  var callbacks = {
    'onStatusChange': null,
    'onData': null,
    'onError': null
  };

  // Set custom callbacks, if there are any
  if (customCallbacks) {
    var callbacksKeys = Object.keys(callbacks);
    for (var c = 0; c < callbacksKeys.length; c++) {
      if (customCallbacks.hasOwnProperty(callbacksKeys[c])) {
        var customCallback = customCallbacks[callbacksKeys[c]];
        if (customCallback) {
          callbacks[callbacksKeys[c]] = customCallback;
        }
      }
    }
  }

  /**
   * Kick starts the recording process.
   *
   * Creates the getUserMedia stream and everything else needed to start
   * streaming audio data to the server.
   */
  this.start = function(options) {
    // Create the microphone input stream
    navigator.getUserMedia({
      'audio': {
        'mandatory': {
          'googEchoCancellation': 'false',
          'googAutoGainControl': 'false',
          'googNoiseSuppression': 'false',
          'googHighpassFilter': 'false'
        },
        'optional': []
      }
    }, function(stream) {
      audioContext = new AudioContext();

      // Let the server know we're ready to start streaming, and set the sample
      // rate to the right amount (441000 for microphone)
      var params = {
        'action': 'start',
        'options': {
          'config': {
            'sampleRate': audioContext.sampleRate
          }
        }
      };

      // Add hints if necessary
      if (options) {
        if (options.hasOwnProperty('speechContext')) {
          params.options.config.speechContext = {
            'phrases': options.speechContext
          }
        }
      }

      socket.emit('recording', params);

      // Connect the microphone
      var source = audioContext.createMediaStreamSource(stream);

      // Set a buffer size
      var bufferLength = 4096;

      // Create a processor to take the audio data input
      var processor = audioContext.createScriptProcessor(bufferLength, 1, 1);
      processor.onaudioprocess = function(event) {
        // Only process the data if we're meant to be recording
        if (isRecording) {
          // Get the audio data (1 channel only)
          var audioData = event.inputBuffer.getChannelData(0) ||
                          new Float32Array(bufferLength);

          // Convert the data and send it through to the server
          socket.emit('data', convertFloat32ToInt16(audioData));
        }
      };

      // Connect the processor
      processor.connect(audioContext.destination);
      source.connect(processor);
    }, function(error) {
      console.error('Error starting:', error);
    });
  };

  /**
   * Stops recording.
   */
  this.stop = function() {
    console.debug('Stopping record');

    /*if (audioContext) {
      try {
        audioContext.close();
      } catch(e) {}
    }*/

    // Let the server know
    socket.emit('recording', {
      'action': 'stop'
    });
  };

  /**
   * Process a file field.
   *
   * @param {!Element} formField The input field to process which holds the
   * audio file.
   */
  this.processFileField = function(formField) {
    var reader = new FileReader();
    reader.onload = function() {
      var parameters = {
        'language': 'en-US',
        'encoding': 'LINEAR16',
        'sampleRate': 16000
      };

      var result = reader.result;

      // Try and work out the encoding, based on the mime type
      var fileType = result.substring(result.indexOf('audio/') + 6,
                                      result.indexOf(';'));

      if (fileType.toLowerCase() === 'flac') {
        parameters.encoding = 'FLAC';
      }

      // Send audio data to the server
      socket.emit('recogniseFile', result.substring(result.indexOf(',') + 1),
                  parameters);
    };

    // Read the form field data
    reader.readAsDataURL(formField.files[0]);
  };

  /**
   * Converts a 32 bit float integer into 16 bit one.
   *
   * @param {!Float32Array} buffer 32 bit integer buffer.
   * @return {Int16Array} 16 bit integer buffer.
   */
  function convertFloat32ToInt16(buffer) {
    var l = buffer.length;
    var buf = new Int16Array(l);
    while (l--) {
      buf[l] = Math.min(1, buffer[l]) * 0x7FFF;
    }
    return buf.buffer;
  }

  /** When the recording status changes */
  socket.on('recordingStatusChange', function(response) {
    console.debug(devCssPrefix, devCssStyle, 'Recording status changed:',
                  response);

    if (response.recording === true) {
      isRecording = true;
    } else {
      isRecording = false;

      // Close the existing audiocontext object if there is one
      if (audioContext) {
        try {
          audioContext.close();  
        } catch(e) {}
      }
    }

    if (callbacks.onStatusChange) {
      callbacks.onStatusChange(response);
    }
  });

  /** When audio data is returned from the server */
  socket.on('recordingData', function(response) {
    if (callbacks.onData) {
      callbacks.onData(response);
    }
  });

  /** When an error is returned from the server */
  socket.on('recordingError', function(response) {
    if (callbacks.onError) {
      console.debug('Error', response);
      callbacks.onError(response);
    }
  });
}
