const engineSelector = document.getElementById('engine-selector') as HTMLSelectElement;
const settingsIcon = document.getElementById('review-settings-button'); // Assuming this is the gear icon button
const settingsPanel = document.getElementById('depth-container');
const arrowsCheckbox = document.getElementById('suggestion-arrows-setting') as HTMLInputElement;
const depthCounter = document.getElementById('depth-counter');

const AVAILABLE_ENGINES: { [key: string]: { name: string, path: string } } = {
    'sf17': {
        name: 'Stockfish 17',
        path: '/static/scripts/stockfish-17-asm.js'
    },
    'sf17_lite': {
        name: 'Stockfish 17 Lite',
        path: '/static/scripts/stockfish-17-lite-single.js'
    },
    'sf16': {
        name: 'Stockfish 16',
        path: '/static/scripts/stockfish-nnue-16.js'
    },
};

const DEFAULT_ENGINE_KEY = 'sf17';
const ENGINE_STORAGE_KEY = 'selectedEnginePath';
const ARROWS_STORAGE_KEY = 'suggestionArrowsEnabled';
const DEPTH_STORAGE_KEY = 'analysisDepth';
const DEFAULT_DEPTH = 18;

function populateEngineSelector() {
    if (!engineSelector) return;

    // Clear existing options
    engineSelector.innerHTML = '';

    // Add new options
    for (const key in AVAILABLE_ENGINES) {
        const engine = AVAILABLE_ENGINES[key];
        const option = document.createElement('option');
        option.value = engine.path;
        option.textContent = engine.name;
        engineSelector.appendChild(option);
    }

    // Load saved preference or default
    const savedEnginePath = localStorage.getItem(ENGINE_STORAGE_KEY);
    if (savedEnginePath && Object.values(AVAILABLE_ENGINES).some(e => e.path === savedEnginePath)) {
        engineSelector.value = savedEnginePath;
    } else {
        engineSelector.value = AVAILABLE_ENGINES[DEFAULT_ENGINE_KEY].path;
        localStorage.setItem(ENGINE_STORAGE_KEY, engineSelector.value);
    }
}

function saveEngineSelection() {
    if (!engineSelector) return;
    localStorage.setItem(ENGINE_STORAGE_KEY, engineSelector.value);
    console.log(`Selected engine saved: ${engineSelector.value}`);
    // Optionally, trigger UI update or reload if necessary
}

// Added functions for arrow setting
function loadArrowsSetting() {
    if (!arrowsCheckbox) return;
    const savedValue = localStorage.getItem(ARROWS_STORAGE_KEY);
    // Default to true (checked) if no setting saved
    arrowsCheckbox.checked = savedValue === null ? true : savedValue === 'true';
}

function saveArrowsSetting() {
    if (!arrowsCheckbox) return;
    localStorage.setItem(ARROWS_STORAGE_KEY, arrowsCheckbox.checked.toString());
}

// Function to update the visual depth counter (from analysis.ts, slightly modified)
function updateDepthCounterDisplay(depth: number) {
    if (!depthCounter) return;
    if (depth <= 14) {
        depthCounter.innerHTML = depth + `|<i class="fa-solid fa-bolt" style="color: #ffffff;"></i>`;
    } else if (depth <= 17) {
        depthCounter.innerHTML = depth + `|<i class="fa-solid fa-wind" style="color: #ffffff;"></i>`;
    } else {
        depthCounter.innerHTML = depth + `|<i class="fa-solid fa-hourglass-half" style="color: #ffffff;"></i>`;
    }
}

// Added functions for depth setting
function loadDepthSetting() {
    const slider = document.getElementById('depth-slider') as HTMLInputElement;
    if (!slider) return;
    const savedValue = localStorage.getItem(DEPTH_STORAGE_KEY);
    const depth = savedValue ? parseInt(savedValue) : DEFAULT_DEPTH;
    slider.value = depth.toString();
    updateDepthCounterDisplay(depth); // Update counter display on load
    // Trigger input event to update slider background gradient (styles.ts relies on this)
    slider.dispatchEvent(new Event('input'));
}

function saveDepthSetting() {
    const slider = document.getElementById('depth-slider') as HTMLInputElement;
    if (!slider) return;
    const depth = parseInt(slider.value);
    localStorage.setItem(DEPTH_STORAGE_KEY, depth.toString());
    // No need to call updateDepthCounterDisplay here, the 'input' event listener 
    // (handled in analysis.ts or styles.ts) already takes care of updating the display.
}

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    populateEngineSelector();
    loadArrowsSetting();
    loadDepthSetting();

    if (engineSelector) {
        engineSelector.addEventListener('change', saveEngineSelection);
    }

    if (arrowsCheckbox) {
        arrowsCheckbox.addEventListener('input', saveArrowsSetting);
    }

    // Add listener to save depth setting when changed
    // Get slider for adding the listener
    const sliderForListener = document.getElementById('depth-slider') as HTMLInputElement;
    if (sliderForListener) {
        sliderForListener.addEventListener('change', saveDepthSetting);
    }

    // REMOVE the logic to show/hide the settings panel
    // The existing logic in analysis.ts handles this.
    // if (settingsIcon && settingsPanel) { 
    //     settingsIcon.addEventListener('click', () => {
    //         const isDisplayed = settingsPanel.style.display !== 'none';
    //         settingsPanel.style.display = isDisplayed ? 'none' : 'block';
    //     });
    // }
});

// Function to get the currently selected engine path for other scripts
// Make this function global by assigning it to window
(window as any).getSelectedEnginePath = function(): string {
    return localStorage.getItem(ENGINE_STORAGE_KEY) || AVAILABLE_ENGINES[DEFAULT_ENGINE_KEY].path;
} 