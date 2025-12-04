import { RateLimitTester } from './tester.js';

// DOM Elements
const ui = {
    startBtn: document.getElementById('start-btn'),
    stopBtn: document.getElementById('stop-btn'),
    promptInput: document.getElementById('prompt-input'),
    delayInput: document.getElementById('delay-input'),
    delayDisplay: document.getElementById('current-delay'),
    rpmDisplay: document.getElementById('current-rpm'),
    successDisplay: document.getElementById('success-count'),
    failDisplay: document.getElementById('fail-count'),
    log: document.getElementById('event-log'),
    imageGrid: document.getElementById('image-grid'),
    status: document.getElementById('system-status')
};

// State
let tester;

// Helper to calculate RPM
function delayToRPM(ms) {
    if (ms <= 0) return "MAX";
    return (60000 / ms).toFixed(1);
}

// Logger
function log(type, message) {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric", second: "numeric" });
    entry.innerHTML = `<span class="log-timestamp">[${time}]</span> ${message}`;
    ui.log.appendChild(entry);
    ui.log.scrollTop = ui.log.scrollHeight;
}

// Image Grid Handler
function addImagePlaceholder(id) {
    const wrapper = document.createElement('div');
    wrapper.className = 'img-wrapper';
    wrapper.id = `img-${id}`;

    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';

    const img = document.createElement('img');

    wrapper.appendChild(spinner);
    wrapper.appendChild(img);
    ui.imageGrid.prepend(wrapper);
}

function updateImage(id, url, success) {
    const wrapper = document.getElementById(`img-${id}`);
    if (!wrapper) return;

    const spinner = wrapper.querySelector('.loading-spinner');
    if (spinner) spinner.remove();

    if (success && url) {
        const img = wrapper.querySelector('img');
        img.src = url;
        wrapper.classList.add('loaded');
    } else {
        wrapper.style.borderColor = 'var(--error)';
        // Simple X mark
        const xMark = document.createElement('div');
        xMark.textContent = "✖";
        xMark.style.cssText = "color: var(--error); position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 2rem;";
        wrapper.appendChild(xMark);
    }
}

// Callbacks for the tester
const callbacks = {
    onStart: () => {
        ui.startBtn.disabled = true;
        ui.stopBtn.disabled = false;
        ui.promptInput.disabled = true;
        ui.delayInput.disabled = true;
        ui.status.textContent = "TESTING ACTIVE";
        ui.status.classList.add('active');
        ui.status.classList.remove('error');
    },
    onStop: () => {
        ui.startBtn.disabled = false;
        ui.stopBtn.disabled = true;
        ui.promptInput.disabled = false;
        ui.delayInput.disabled = false;
        ui.status.textContent = "IDLE";
        ui.status.classList.remove('active');
    },
    onLog: log,
    onUpdateStats: (stats) => {
        ui.delayDisplay.textContent = stats.delay;
        ui.rpmDisplay.textContent = delayToRPM(stats.delay);
        ui.successDisplay.textContent = stats.success;
        ui.failDisplay.textContent = stats.fail;

        if (stats.fail > 0 && stats.fail > stats.success) {
            ui.status.classList.add('error');
            ui.status.textContent = "LIMIT DETECTED";
        }
    },
    onImageStart: addImagePlaceholder,
    onImageSuccess: (id, url) => updateImage(id, url, true),
    onImageFail: (id) => updateImage(id, null, false)
};

// Init
tester = new RateLimitTester(callbacks);

ui.startBtn.addEventListener('click', () => {
    const prompt = ui.promptInput.value.trim() || "Abstract Datastream";
    const initialDelay = ui.delayInput.value || 12000;
    tester.start(prompt, initialDelay);
});

ui.stopBtn.addEventListener('click', () => {
    tester.stop();
});

// Initial Log
log('info', 'Rate Limit Protocol loaded. Ready for subject input.');