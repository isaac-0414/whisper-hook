
function convertTypedArray(src, type) {
    var buffer = new ArrayBuffer(src.byteLength);
    var baseView = new src.constructor(buffer).set(src);
    return new type(buffer);
}

var printTextarea = (function() {
    var element = document.getElementById('output');
    if (element) element.alue = ''; // clear browser cache
    return function(text) {
        if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
        if (element) {
            element.value += text + "\n";
            element.scrollTop = element.scrollHeight; // focus on bottom
        }
    };
})();

async function clearCache() {
    if (confirm('Are you sure you want to clear the cache?\nAll the models will be downloaded again.')) {
        indexedDB.deleteDatabase(dbName);
    }
}

// fetch a remote file from remote URL using the Fetch API
async function fetchRemote(url, cbProgress, cbPrint) {
    cbPrint('fetchRemote: downloading with fetch()...');

    const response = await fetch(
        url,
        {
            method: 'GET'
        }
    );

    if (!response.ok) {
        cbPrint('fetchRemote: failed to fetch ' + url);
        return;
    }

    const contentLength = response.headers.get('content-length');
    const total = parseInt(contentLength, 10);
    const reader = response.body.getReader();

    var chunks = [];
    var receivedLength = 0;
    var progressLast = -1;

    while (true) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        chunks.push(value);
        receivedLength += value.length;

        if (contentLength) {
            cbProgress(receivedLength/total);

            var progressCur = Math.round((receivedLength / total) * 10);
            if (progressCur != progressLast) {
                cbPrint('fetchRemote: fetching ' + 10*progressCur + '% ...');
                progressLast = progressCur;
            }
        }
    }

    var position = 0;
    var chunksAll = new Uint8Array(receivedLength);

    for (var chunk of chunks) {
        chunksAll.set(chunk, position);
        position += chunk.length;
    }

    return chunksAll;
}

// load remote data
// - check if the data is already in the IndexedDB
// - if not, fetch it from the remote URL and store it in the IndexedDB
function loadRemote(url, dst, size_mb, cbProgress, cbReady, cbCancel, cbPrint) {
    // query the storage quota and print it
    navigator.storage.estimate().then(function (estimate) {
        cbPrint('loadRemote: storage quota: ' + estimate.quota + ' bytes');
        cbPrint('loadRemote: storage usage: ' + estimate.usage + ' bytes');
    });

    // check if the data is already in the IndexedDB
    var rq = indexedDB.open(dbName, dbVersion);

    rq.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (db.version == 1) {
            var os = db.createObjectStore('models', { autoIncrement: false });
            cbPrint('loadRemote: created IndexedDB ' + db.name + ' version ' + db.version);
        } else {
            // clear the database
            var os = event.currentTarget.transaction.objectStore('models');
            os.clear();
            cbPrint('loadRemote: cleared IndexedDB ' + db.name + ' version ' + db.version);
        }
    };

    rq.onsuccess = function (event) {
        var db = event.target.result;
        var tx = db.transaction(['models'], 'readonly');
        var os = tx.objectStore('models');
        var rq = os.get(url);

        rq.onsuccess = function (event) {
            if (rq.result) {
                cbPrint('loadRemote: "' + url + '" is already in the IndexedDB');
                cbReady(dst, rq.result);
            } else {
                // data is not in the IndexedDB
                cbPrint('loadRemote: "' + url + '" is not in the IndexedDB');

                // alert and ask the user to confirm
                if (!confirm(
                    'You are about to download ' + size_mb + ' MB of data.\n' +
                    'The model data will be cached in the browser for future use.\n\n' +
                    'Press OK to continue.')) {
                    cbCancel();
                    return;
                }

                fetchRemote(url, cbProgress, cbPrint).then(function (data) {
                    if (data) {
                        // store the data in the IndexedDB
                        var rq = indexedDB.open(dbName, dbVersion);
                        rq.onsuccess = function (event) {
                            var db = event.target.result;
                            var tx = db.transaction(['models'], 'readwrite');
                            var os = tx.objectStore('models');
                            var rq = os.put(data, url);

                            rq.onsuccess = function (event) {
                                cbPrint('loadRemote: "' + url + '" stored in the IndexedDB');
                                cbReady(dst, data);
                            };

                            rq.onerror = function (event) {
                                cbPrint('loadRemote: failed to store "' + url + '" in the IndexedDB');
                                cbCancel();
                            };
                        };
                    }
                });
            }
        };

        rq.onerror = function (event) {
            cbPrint('loadRemote: failed to get data from the IndexedDB');
            cbCancel();
        };
    };

    rq.onerror = function (event) {
        cbPrint('loadRemote: failed to open IndexedDB');
        cbCancel();
    };

    rq.onblocked = function (event) {
        cbPrint('loadRemote: failed to open IndexedDB: blocked');
        cbCancel();
    };

    rq.onabort = function (event) {
        cbPrint('loadRemote: failed to open IndexedDB: abort');
    };
}

// web audio context
var context = null;

// audio data
var audio = null;
var audio0 = null;

// the stream instance
var instance = null;

// model name
var model_whisper = null;

var Module = {
    print: printTextarea,
    printErr: printTextarea,
    setStatus: function(text) {
        printTextarea('js: ' + text);
    },
    monitorRunDependencies: function(left) {
    },
    preRun: function() {
        printTextarea('js: Preparing ...');
    },
    postRun: function() {
        printTextarea('js: Initialized successfully!');
    }
};

//
// fetch models
//

let dbVersion = 1
let dbName    = 'whisper.ggerganov.com';
let indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB

function storeFS(fname, buf) {
    // write to WASM file using FS_createDataFile
    // if the file exists, delete it
    try {
        Module.FS_unlink(fname);
    } catch (e) {
        // ignore
    }

    Module.FS_createDataFile("/", fname, buf, true, true);

    printTextarea('storeFS: stored model: ' + fname + ' size: ' + buf.length);

    document.getElementById('model-whisper-status').innerHTML = 'loaded "' + model_whisper + '"!';

    if (model_whisper != null) {
        document.getElementById('start').disabled = false;
        document.getElementById('stop' ).disabled = true;
    }
}

function loadWhisper(model) {
    let urls = {
        'tiny.en': 'https://gnp4.web.illinois.edu/scribear/data/ggml-model-whisper-tiny.en.bin',
        'base.en': 'https://gnp4.web.illinois.edu/scribear/data/ggml-model-whisper-base.en.bin',
    };

    let sizes = {
        'tiny.en': 75,
        'base.en': 142,
    };

    let url     = urls[model];
    let dst     = 'whisper.bin';
    let size_mb = sizes[model];

    model_whisper = model;

    document.getElementById('fetch-whisper-tiny-en').style.display = 'none';
    document.getElementById('fetch-whisper-base-en').style.display = 'none';
    document.getElementById('model-whisper-status').innerHTML = 'loading "' + model + '" ... ';

    cbProgress = function(p) {
        let el = document.getElementById('fetch-whisper-progress');
        el.innerHTML = Math.round(100*p) + '%';
        
        console.log('progress: ' + Math.round(100*p) + '%');
        sessionStorage.setItem('whisper_progress', Math.round(100*p));
    };

    cbCancel = function() {
        var el;
        el = document.getElementById('fetch-whisper-tiny-en'); if (el) el.style.display = 'inline-block';
        el = document.getElementById('fetch-whisper-base-en'); if (el) el.style.display = 'inline-block';
        el = document.getElementById('model-whisper-status');  if (el) el.innerHTML = '';
    };

    loadRemote(url, dst, size_mb, cbProgress, storeFS, cbCancel, printTextarea);
}

//
// microphone
//

const kSampleRate = 16000;
const kRestartRecording_s = 120;
const kIntervalAudio_ms = 3000; // pass the recorded audio to the C++ instance at this rate

var mediaRecorder = null;
var doRecording = false;
var startTime = 0;

window.AudioContext = window.AudioContext || window.webkitAudioContext;
window.OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;

function stopRecording() {
    Module.set_status("paused");
    doRecording = false;
    audio0 = null;
    audio = null;
    context = null;
}

function startRecording() {
    if (!context) {
        context = new AudioContext({
            sampleRate: kSampleRate,
            channelCount: 1,
            echoCancellation: false,
            autoGainControl:  true,
            noiseSuppression: true,
        });
    }

    Module.set_status("");

    document.getElementById('start').disabled = true;
    document.getElementById('stop').disabled = false;

    doRecording = true;
    startTime = Date.now();

    var chunks = [];
    var stream = null;

    navigator.mediaDevices.getUserMedia({audio: true, video: false})
        .then(function(s) {
            stream = s;
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = function(e) {
                chunks.push(e.data);

                var blob = new Blob(chunks, { 'type' : 'audio/ogg; codecs=opus' });
                var reader = new FileReader();

                reader.onload = function(event) {
                    var buf = new Uint8Array(reader.result);

                    if (!context) {
                        return;
                    }
                    context.decodeAudioData(buf.buffer, function(audioBuffer) {
                        var offlineContext = new OfflineAudioContext(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate);
                        var source = offlineContext.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(offlineContext.destination);
                        source.start(0);

                        offlineContext.startRendering().then(function(renderedBuffer) {
                            audio = renderedBuffer.getChannelData(0);

                            //printTextarea('js: audio recorded, size: ' + audio.length + ', old size: ' + (audio0 == null ? 0 : audio0.length));

                            var audioAll = new Float32Array(audio0 == null ? audio.length : audio0.length + audio.length);
                            if (audio0 != null) {
                                audioAll.set(audio0, 0);
                            }
                            audioAll.set(audio, audio0 == null ? 0 : audio0.length);

                            if (instance) {
                                Module.set_audio(instance, audioAll);
                            }
                        });
                    }, function(e) {
                        audio = null;
                    });
                }

                reader.readAsArrayBuffer(blob);
            };

            mediaRecorder.onstop = function(e) {
                if (doRecording) {
                    setTimeout(function() {
                        startRecording();
                    });
                }
            };

            mediaRecorder.start(kIntervalAudio_ms);
        })
        .catch(function(err) {
            printTextarea('js: error getting audio stream: ' + err);
        });

    var interval = setInterval(function() {
        if (!doRecording) {
            clearInterval(interval);
            mediaRecorder.stop();
            stream.getTracks().forEach(function(track) {
                track.stop();
            });

            document.getElementById('start').disabled = false;
            document.getElementById('stop').disabled  = true;

            mediaRecorder = null;
        }

        // if audio length is more than kRestartRecording_s seconds, restart recording
        if (audio != null && audio.length > kSampleRate*kRestartRecording_s) {
            if (doRecording) {
                //printTextarea('js: restarting recording');

                clearInterval(interval);
                audio0 = audio;
                audio = null;
                mediaRecorder.stop();
                stream.getTracks().forEach(function(track) {
                    track.stop();
                });
            }
        }
    }, 100);
}

//
// main
//

var nLines = 0;
var intervalUpdate = null;
var transcribedAll = '';

function onStart() {
    if (!instance) {
        instance = Module.init('whisper.bin');

        if (instance) {
            printTextarea("js: whisper initialized, instance: " + instance);
        }
    }

    if (!instance) {
        printTextarea("js: failed to initialize whisper");
        return;
    }

    startRecording();

    intervalUpdate = setInterval(function() {
        var transcribed = Module.get_transcribed();

        if (transcribed != null && transcribed.length > 1) {
            transcribedAll += transcribed + '\n';
            nLines++;

            // if more than 10 lines, remove the first line
            if (nLines > 10) {
                var i = transcribedAll.indexOf('\n');
                if (i > 0) {
                    transcribedAll = transcribedAll.substring(i + 4);
                    nLines--;
                }
            }
        }

        document.getElementById('state-status').innerHTML = Module.get_status();
        document.getElementById('state-transcribed').innerHTML = transcribedAll;
        // console.log("check transcription: "+transcribedAll);
        sessionStorage.setItem('whisper_transcript', transcribedAll);
    }, 100);
}

function onStop() {
    stopRecording();
}

// set text from sessionStorage

// Get the element where we want to display the text
// const myElement = document.querySelector('#myElement');

// // Get the initial value of the session variable
// let myText = sessionStorage.getItem('myText');

// // Display the initial value of the session variable
// myElement.value = myText;

// // Add an event listener to detect changes in the session variable
// window.addEventListener('storage', function(event) {
// if (event.key === 'myText') {
//     myText = event.newValue;
//     myElement.value = myText;
// }
// });

// button click

// let isTrue = sessionStorage.getItem('isTrue') === 'true';

// function toggleBoolean() {
// isTrue = !isTrue;
// sessionStorage.setItem('isTrue', isTrue.toString());
// }

// Add an event listener to a button that toggles the boolean
// const button = document.querySelector('#myButton');
// button.addEventListener('click', toggleBoolean);

// simulating button clicks

window.addEventListener('storage', (event) => {
    if (event.key === 'listening') {
        if (event.newValue === 'true') {
            console.log("started!")
            onStart();
        } else {
            console.log("stopped!")
            onStop();
        }
    }
});

window.addEventListener('storage', (event) => {
    if (event.key === 'isClearCache') {
        if (event.newValue === 'true') {
            console.log("clear cache!")
            clearCache();
        } else {
            console.log("clear cache!")
        }
    }
});

window.addEventListener('storage', (event) => {
    if (event.key === 'isDownloadTiny') {
        if (event.newValue === 'true') {
            console.log("download tiny!")
            loadWhisper('tiny.en');
        } else {
            console.log("download tiny!")
        }
    }
});

window.addEventListener('storage', (event) => {
    if (event.key === 'isDownloadBase') {
        if (event.newValue === 'true') {
            console.log("download base!")
            loadWhisper('base.en');
        } else {
            console.log("download base!")
        }
    }
});


document.querySelector("#fetch-whisper-tiny-en").addEventListener('click', () => {
    console.log("clicked")
    loadWhisper('tiny.en');
});

document.querySelector("#fetch-whisper-base-en").addEventListener('click', () => {
    loadWhisper('base.en');
});

document.querySelector("#start").addEventListener('click', () => {
    onStart();
});

document.querySelector("#stop").addEventListener('click', () => {
    onStop();
});

document.querySelector("#clear").addEventListener('click', () => {
    clearCache();
});

