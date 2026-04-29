import { State } from './state.js';

export const UI = {
    init() {
        this.bindCheckboxes();
        console.log("UI intializing (Checkboxes only, sliders removed)");
    },

    bindCheckboxes() {
        const selectAllBox = document.getElementById('select-all-checkbox');
        const checkboxes = document.querySelectorAll('.crime-checkbox');
        
        const updateState = () => {
            const selectedTypes = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
            State.updateCrimeTypes(selectedTypes);
        };

        if (selectAllBox) {
            selectAllBox.addEventListener('change', (e) => {
                checkboxes.forEach(box => box.checked = e.target.checked);
                updateState();
            });
        }

        checkboxes.forEach(box => {
            box.addEventListener('change', () => {
                if (selectAllBox) {
                    selectAllBox.checked = Array.from(checkboxes).every(cb => cb.checked);
                }
                updateState();
            });
        });
    }
};