import { State } from './state.js';

export const UI = {
    init() {
        this.bindResetButton();
        this.bindGlobalInteractions(); 
        this.renderWeightBar(); 

        State.subscribe(() => {
            this.renderWeightBar();
        });
    },

    bindResetButton() {
        const btn = document.getElementById('reset-weights-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                State.resetWeights();
            });
        }
    },

    renderWeightBar() {
        const bar = document.getElementById('weight-bar');
        if (!bar) return;
        bar.innerHTML = '';
        const weights = State.filters.crimeWeights;

        for (let type in weights) {
            if (weights[type] > 0) {
                const seg = document.createElement('div');
                seg.className = 'weight-segment';
                
                seg.draggable = true;
                seg.setAttribute('data-type', type);
                
                const color = State.explicitTypes.includes(type) ? (State.typeColors[type] || '#ffffff') : (State.typeColors['OTHER'] || '#7f7f7f');
                seg.style.backgroundColor = color;
                seg.style.flex = weights[type]; 
                
                const pct = (weights[type] * 100).toFixed(1);
                seg.title = `${type}: ${pct}%`;
                
                seg.addEventListener('wheel', (e) => {
                    e.preventDefault(); 
                    const delta = e.deltaY < 0 ? 0.01 : -0.01; 
                    State.updateSingleWeight(type, delta);
                });

                seg.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', type);
                    e.dataTransfer.setData('source', 'weight-bar'); 
                    document.body.classList.add('drag-active-remove'); 
                });
                
                seg.addEventListener('dragend', () => {
                    document.body.classList.remove('drag-active-remove');
                });
                
                bar.appendChild(seg);
            }
        }
    },

    bindGlobalInteractions() {
        document.getElementById('checkbox-list-container').addEventListener('change', (e) => {
            if (e.target.id === 'select-all-checkbox') {
                const isChecked = e.target.checked;
                document.querySelectorAll('.crime-checkbox').forEach(box => box.checked = isChecked);
                this.updateStateFromCheckboxes();
            } else if (e.target.classList.contains('crime-checkbox')) {
                const selectAllBox = document.getElementById('select-all-checkbox');
                if (selectAllBox) {
                    const checkboxes = document.querySelectorAll('.crime-checkbox');
                    selectAllBox.checked = Array.from(checkboxes).every(cb => cb.checked);
                }
                this.updateStateFromCheckboxes();
            }
        });

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.style.position = 'absolute';
        colorInput.style.opacity = '0'; 
        colorInput.style.pointerEvents = 'none';
        colorInput.style.zIndex = '9999';
        document.body.appendChild(colorInput);

        let currentColorType = null;

        document.getElementById('checkbox-list-container').addEventListener('click', (e) => {
            if (e.target.classList.contains('legend-color')) {
                const type = e.target.getAttribute('data-type');
                if (State.explicitTypes.includes(type) || type === 'OTHER') {
                    currentColorType = type;
                    colorInput.value = State.typeColors[type] || '#ffffff';
                    
                    colorInput.style.left = e.clientX + 'px';
                    colorInput.style.top = e.clientY + 'px';
                    colorInput.click(); 
                }
            }
        });

        colorInput.addEventListener('input', (e) => {
            if (currentColorType) {
                State.updateColor(currentColorType, e.target.value);
            }
        });

        const container = document.getElementById('checkbox-list-container');
        const weightBar = document.getElementById('weight-bar');
        
        let autoScrollInterval = null;

        container.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('legend-color')) {
                const type = e.target.getAttribute('data-type');
                if (type === 'OTHER') {
                    e.preventDefault(); 
                    return;
                }
                e.dataTransfer.setData('text/plain', type);
                
                const isSubItem = !State.explicitTypes.includes(type);
                e.dataTransfer.setData('is-sub-item', isSubItem.toString());
                
                if (isSubItem) {
                    document.body.classList.add('drag-active-pull-out-global');
                } else {
                    const otherRow = document.getElementById('other-row');
                    if(otherRow) otherRow.classList.add('drag-active-drop-in');
                    if(weightBar) weightBar.classList.add('drag-over');
                }
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            
            const rightPanel = document.querySelector('.right-panel');
            if(!rightPanel) return;
            
            const rect = rightPanel.getBoundingClientRect();
            const topDist = e.clientY - rect.top;
            const bottomDist = rect.bottom - e.clientY;
            
            const edgeThreshold = 60; 

            if (autoScrollInterval) clearInterval(autoScrollInterval);

            if (topDist < edgeThreshold) {
                autoScrollInterval = setInterval(() => { rightPanel.scrollTop -= 10; }, 20);
            } else if (bottomDist < edgeThreshold) {
                autoScrollInterval = setInterval(() => { rightPanel.scrollTop += 10; }, 20);
            }
        });

        document.body.addEventListener('dragend', () => {
            if (autoScrollInterval) clearInterval(autoScrollInterval);
            document.body.classList.remove('drag-active-pull-out-global');
            document.body.classList.remove('drag-active-remove');
            
            const otherRow = document.getElementById('other-row');
            if(otherRow) otherRow.classList.remove('drag-active-drop-in');
            if(weightBar) weightBar.classList.remove('drag-over');
        });

        document.body.addEventListener('dragover', (e) => { e.preventDefault(); });

        document.body.addEventListener('drop', (e) => {
            e.preventDefault();
            if (autoScrollInterval) clearInterval(autoScrollInterval);
            document.body.classList.remove('drag-active-pull-out-global');
            document.body.classList.remove('drag-active-remove');
            
            const type = e.dataTransfer.getData('text/plain');
            if (!type) return;

            const source = e.dataTransfer.getData('source');
            
            if (source === 'weight-bar') {
                if (!e.target.closest('#weight-bar')) {
                    const cb = document.querySelector(`.crime-checkbox[value="${type}"]`);
                    if (cb && cb.checked) {
                        cb.checked = false;
                        const selectAllBox = document.getElementById('select-all-checkbox');
                        if (selectAllBox) selectAllBox.checked = false;
                        this.updateStateFromCheckboxes();
                    }
                }
                return;
            }

            const isSubItem = e.dataTransfer.getData('is-sub-item') === 'true';

            if (isSubItem) {
                if (!e.target.closest('#other-row')) {
                    State.promoteToExplicit(type);
                    setTimeout(() => {
                        const newCb = document.querySelector(`.crime-checkbox[value="${type}"]`);
                        if(newCb && !newCb.checked) {
                            newCb.checked = true;
                            this.updateStateFromCheckboxes();
                        }
                    }, 50);
                }
            } 
            else {
                if (e.target.closest('#other-row')) {
                    State.demoteToOther(type);
                } 
                else if (e.target.closest('#weight-bar')) {
                    const cb = document.querySelector(`.crime-checkbox[value="${type}"]`);
                    if (cb && !cb.checked) {
                        cb.checked = true;
                        const checkboxes = document.querySelectorAll('.crime-checkbox');
                        const selectAllBox = document.getElementById('select-all-checkbox');
                        if (selectAllBox) selectAllBox.checked = Array.from(checkboxes).every(c => c.checked);
                        this.updateStateFromCheckboxes();
                    }
                }
            }
            
            if(weightBar) weightBar.classList.remove('drag-over');
            const otherRow = document.getElementById('other-row');
            if(otherRow) otherRow.classList.remove('drag-active-drop-in');
        });
    },

    updateStateFromCheckboxes() {
        const checkboxes = document.querySelectorAll('.crime-checkbox');
        const selectedTypes = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
        State.updateCrimeTypes(selectedTypes);
    }
};