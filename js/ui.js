import { State } from './state.js';

const TYPE_COLORS = {
    'THEFT': '#1f77b4', 'BATTERY': '#ff7f0e', 'CRIMINAL DAMAGE': '#ffbb78',
    'NARCOTICS': '#2ca02c', 'ASSAULT': '#d62728', 'BURGLARY': '#9467bd',
    'ROBBERY': '#8c564b', 'MOTOR VEHICLE THEFT': '#e377c2', 'HOMICIDE': '#000000', 'OTHER': '#7f7f7f'
};

export const UI = {
    init() {
        this.bindCheckboxes();
        this.bindWeightBarDragDrop();
        this.bindResetButton(); // 👈 挂载新监听器
        this.renderWeightBar(); 

        State.subscribe(() => {
            this.renderWeightBar();
        });
    },

    // 👇 新增：监听 Reset 按钮点击
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
                seg.style.backgroundColor = TYPE_COLORS[type];
                seg.style.flex = weights[type]; 
                
                const pct = (weights[type] * 100).toFixed(1);
                seg.title = `${type}: ${pct}% (Hover & Scroll to adjust weight)`;
                
                seg.addEventListener('wheel', (e) => {
                    e.preventDefault(); 
                    const delta = e.deltaY < 0 ? 0.05 : -0.05; 
                    State.updateSingleWeight(type, delta);
                });
                
                bar.appendChild(seg);
            }
        }
    },

    bindWeightBarDragDrop() {
        const bar = document.getElementById('weight-bar');
        if (!bar) return;

        bar.addEventListener('dragover', (e) => {
            e.preventDefault();
            bar.classList.add('drag-over');
        });

        bar.addEventListener('dragleave', () => {
            bar.classList.remove('drag-over');
        });

        bar.addEventListener('drop', (e) => {
            e.preventDefault();
            bar.classList.remove('drag-over');
            const type = e.dataTransfer.getData('text/plain');
            if (type) {
                const cb = document.querySelector(`.crime-checkbox[value="${type}"]`);
                if (cb && !cb.checked) {
                    cb.checked = true;
                    const checkboxes = document.querySelectorAll('.crime-checkbox');
                    const selectAllBox = document.getElementById('select-all-checkbox');
                    if(selectAllBox) selectAllBox.checked = Array.from(checkboxes).every(c => c.checked);
                    
                    const selectedTypes = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
                    State.updateCrimeTypes(selectedTypes);
                }
            }
        });
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
            const dot = box.parentElement.querySelector('.legend-color');
            if (dot) {
                dot.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', dot.getAttribute('data-type'));
                });
            }

            box.addEventListener('change', () => {
                if (selectAllBox) {
                    selectAllBox.checked = Array.from(checkboxes).every(cb => cb.checked);
                }
                updateState();
            });
        });
    }
};