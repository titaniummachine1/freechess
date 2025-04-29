const engineSelector = document.getElementById('engine-selector') as HTMLSelectElement;
const settingsIcon = document.getElementById('review-settings-button'); // Assuming this is the gear icon button
const settingsPanel = document.getElementById('depth-container');
const arrowsCheckbox = document.getElementById('suggestion-arrows-setting') as HTMLInputElement;

const AVAILABLE_ENGINES: { [key: string]: { name: string, path: string } } = {
    'sf17': {
        name: 'Stockfish 17',
        path: '/static/scripts/stockfish-17-single.js'
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

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    populateEngineSelector();
    loadArrowsSetting();

    if (engineSelector) {
        engineSelector.addEventListener('change', saveEngineSelection);
    }

    if (arrowsCheckbox) {
        arrowsCheckbox.addEventListener('input', saveArrowsSetting);
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