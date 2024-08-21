let audioContext;
let audioBuffers = [];
let currentSyllableIndex = 0;
let instrumentSelect = document.getElementById('instrumentSelect');
let syllableSelect = document.getElementById('syllableSelect');
let pitchControl = document.getElementById('pitchControl');
let pitchValue = document.getElementById('pitchValue');

document.addEventListener('DOMContentLoaded', loadSettings);

instrumentSelect.addEventListener('change', () => {
    saveSettings();
    loadInstrument();
});
pitchControl.addEventListener('input', () => {
    pitchValue.textContent = pitchControl.value;
    saveSettings();
});
syllableSelect.addEventListener('change', () => {
    saveSettings();
    changeSyllable();
});
document.getElementById('playButton').addEventListener('click', playSound);
document.getElementById('addSyllableButton').addEventListener('click', addSyllable);
document.getElementById('downloadButton').addEventListener('click', downloadEditedSound);

function loadInstrument() {
    let selectedInstrument = instrumentSelect.value;
    let filePath = `sounds/${selectedInstrument}`;
    
    fetch(filePath)
        .then(response => response.arrayBuffer())
        .then(data => {
            if (selectedInstrument.endsWith('.mp3')) {
                initAudioContextMP3(data, currentSyllableIndex);
            } else {
                initAudioContextWAV(data, currentSyllableIndex);
            }
        });
}

function initAudioContextWAV(arrayBuffer, syllableIndex) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    audioContext.decodeAudioData(arrayBuffer, function(buffer) {
        audioBuffers[syllableIndex] = buffer;
    });
}

function initAudioContextMP3(arrayBuffer, syllableIndex) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    audioContext.decodeAudioData(arrayBuffer, function(buffer) {
        audioBuffers[syllableIndex] = buffer;
    });
}

function updatePitch() {
    pitchValue.textContent = pitchControl.value;
}

function playSound() {
    if (audioBuffers[currentSyllableIndex]) {
        let sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffers[currentSyllableIndex];

        // ピッチを変更するための再生速度を設定
        sourceNode.playbackRate.value = Math.pow(2, pitchControl.value / 12);

        sourceNode.connect(audioContext.destination);
        sourceNode.start(0);
    }
}

function addSyllable() {
    let newIndex = audioBuffers.length;
    let newOption = document.createElement("option");
    newOption.value = `syllable${newIndex + 1}`;
    newOption.text = `音節 ${newIndex + 1}`;
    syllableSelect.add(newOption);
    
    // 新しい音節を選択
    syllableSelect.value = newOption.value;
    changeSyllable();
    saveSettings();
}

function changeSyllable() {
    currentSyllableIndex = syllableSelect.selectedIndex;
    loadInstrument();
}

function saveSettings() {
    localStorage.setItem('instrument', instrumentSelect.value);
    localStorage.setItem('syllable', syllableSelect.value);
    localStorage.setItem('pitch', pitchControl.value);

    // 音節データを保存
    let syllableBuffers = audioBuffers.map(buffer => {
        return bufferToWavArrayBuffer(buffer);
    });
    localStorage.setItem('syllableBuffers', JSON.stringify(syllableBuffers));
}

function loadSettings() {
    let savedInstrument = localStorage.getItem('instrument');
    let savedSyllable = localStorage.getItem('syllable');
    let savedPitch = localStorage.getItem('pitch');
    let savedSyllableBuffers = localStorage.getItem('syllableBuffers');

    if (savedInstrument) {
        instrumentSelect.value = savedInstrument;
        loadInstrument();
    }
    
    if (savedSyllable) {
        syllableSelect.value = savedSyllable;
    }

    if (savedPitch) {
        pitchControl.value = savedPitch;
        pitchValue.textContent = savedPitch;
    }

    if (savedSyllableBuffers) {
        let syllableBuffers = JSON.parse(savedSyllableBuffers);
        audioBuffers = syllableBuffers.map(bufferData => {
            return wavArrayBufferToBuffer(bufferData);
        });
    }
}

function bufferToWavArrayBuffer(buffer) {
    let wav = bufferToWave(buffer);
    return new Uint8Array(wav).buffer;
}

function wavArrayBufferToBuffer(arrayBuffer) {
    let blob = new Blob([arrayBuffer], { type: 'audio/wav' });
    return new Promise(resolve => {
        let reader = new FileReader();
        reader.onload = function() {
            let context = new (window.AudioContext || window.webkitAudioContext)();
            context.decodeAudioData(reader.result, resolve);
        };
        reader.readAsArrayBuffer(blob);
    });
}

function downloadEditedSound() {
    if (audioBuffers.length === 0) return;

    let mergedBuffer = mergeBuffers(audioBuffers);
    let audioBlob = bufferToWave(mergedBuffer);
    let url = URL.createObjectURL(audioBlob);
    let a = document.createElement('a');
    a.href = url;
    a.download = 'edited_sound.wav';
    a.click();
}

function mergeBuffers(buffers) {
    let channels = buffers[0].numberOfChannels;
    let sampleRate = buffers[0].sampleRate;
    let length = buffers.reduce((acc, buffer) => acc + buffer.length, 0);

    let offlineContext = new OfflineAudioContext(channels, length, sampleRate);

    let offset = 0;
    buffers.forEach(buffer => {
        let source = offlineContext.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineContext.destination);
        source.start(offset / sampleRate);
        offset += buffer.length;
    });

    return offlineContext.startRendering();
}

function bufferToWave(buffer) {
    let length = buffer.length * buffer.numberOfChannels * 2 + 44;
    let view = new DataView(new ArrayBuffer(length));
    let channels = [];
    let offset = 0;
    let pos = 0;

    writeString(view, pos, 'RIFF'); pos += 4;
    view.setUint32(pos, length - 8, true); pos += 4;
    writeString(view, pos, 'WAVE'); pos += 4;
    writeString(view, pos, 'fmt '); pos += 4;
    view.setUint32(pos, 16, true); pos += 4;
    view.setUint16(pos, 1, true); pos += 2;
    view.setUint16(pos, buffer.numberOfChannels, true); pos += 2;
    view.setUint32(pos, buffer.sampleRate, true); pos += 4;
    view.setUint32(pos, buffer.sampleRate * 4, true); pos += 4;
    view.setUint16(pos, buffer.numberOfChannels * 2, true); pos += 2;
    view.setUint16(pos, 16, true); pos += 2;
    writeString(view, pos, 'data'); pos += 4;
    view.setUint32(pos, length - pos - 4, true); pos += 4;

    for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    let sampleCount = buffer.length;
    let bytesPerSample = 2;

    for (let i = 0; i < sampleCount; i++) {
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            let sample = channels[channel][i] * 0x7FFF;
            view.setInt16(pos, sample, true);
            pos += bytesPerSample;
        }
    }

    return view.buffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
