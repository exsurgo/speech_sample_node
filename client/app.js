/**
 * Cloud Speech API streaming example for Node.js using gRPC.
 *
 * This file powers the frontend UI, connects to the WebSockets server, and
 * creates a new Cloud Speech API client.
 */

// The API client
var apiClient = null;

/**
 * Toggles microphone recording button on/off.
 *
 * @param {!string} to Either start or stop the recording.
 */
function toggleMicrophoneRecordingButton(to) {
  var microphoneButton = document.querySelector('#microphoneButton');
  console.debug('Toggling button');
  if (to === 'start') {
    microphoneButton.innerHTML = 'Start recording';
    microphoneButton.disabled = false;
  } else if (to === 'stop') {
    microphoneButton.innerHTML = 'Stop recording';
  }
}

/**
 * Toggles microphone recording on/off.
 *
 * @param {!Object} event Button click event.
 */
function toggleMicrophoneRecording(event) {
  if (event.target.innerHTML.indexOf('Start') !== -1) {
    // Start recording
    apiClient.start();

    // For hints, add a space separated list of words:
    /*apiClient.start({
      'speechContext': 'special words to listen out for'
    });*/

    toggleMicrophoneRecordingButton('stop');
  } else {
    // Stop recording
    apiClient.stop();
    toggleMicrophoneRecordingButton('start');
  }
}

/**
 * Data response from the API streamer.
 *
 * @param {!Object<string>} response Response from the Cloud Speech API
 * streamer.
 */
function onData(response) {
  // console.log('Data:', response);

  var sentence = '';
  var completeUtterance = false;
  for (var r = 0; r < response.data.length; r++) {
    var utterances = response.data[r];

    // Is this a complete utterance?
    if (utterances.isFinal) {
      completeUtterance = true;
    }

    // Run through each utterance
    var alternatives = utterances.alternatives;
    for (var a = 0; a < alternatives.length; a++) {
      var utterance = alternatives[a];
      sentence += utterance.transcript;
    }
  }

  if (completeUtterance) {
    document.querySelector('#response span.incomplete').innerHTML = '';
    document.querySelector('#response span.final').innerHTML = sentence +
                                                               '<br/>';
  } else {
    document.querySelector('#response span.incomplete').innerHTML = sentence;
  }
}

/**
 * Handler for Cloud Speech API client when recording status changes.
 *
 * @param {!Object<string>} status The new status.
 */
function onStatusChange(status) {
  // Turn off the recording button if we need to
  if (!status.recording) {
    toggleMicrophoneRecordingButton('start');
  }
}

/**
 * Error handler for Cloud Speech API client.
 *
 * @param {!Object<string>} error The returned error.
 */
function onError(error) {
  // Turn off the recording button if we need to
  if (!error.recording) {
    toggleMicrophoneRecordingButton('start');
  }
}

// When the page loads
window.onload = function() {
  // Create the WebSockets connection.
  // Defaults to hardcoded server which only accepts connections from
  // ZOO Tech prototypes Storage bucket, so you'll probably need to change it.
  var socket = io('https://cloudspeechstreaming-dot-zoo-tech-external.' +
                  'appspot.com');

  // Make the connection able to send binary data
  socket.binaryType = 'arraybuffer';

  socket.on('connect', function() {
    console.log('Client connected over WebSockets');

    // Create a new client
    apiClient = new CloudSpeechApiClient(socket, {
      'onData': onData,
      'onStatusChange': onStatusChange,
      'onError': onError
    });

    // Handle the microphone button
    document.querySelector('#microphoneButton').addEventListener('click',
        toggleMicrophoneRecording);

    // Toggle microphone button on
    toggleMicrophoneRecordingButton('start');

    document.querySelector('#audioFile').disabled = false;

    // Handle the audio file input
    document.querySelector('#audioFile').addEventListener('change',
        function(e) {
      document.querySelector('#response span.incomplete').innerHTML =
          'Sending to Cloud Speech API...';
      apiClient.processFileField(e.target);
    });
  });
};
