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
                
                const color = State.explicitTypes.includes(type) ? (State.typeColors[type] || '#ffffff') : (State.typeColors['OTHER'] || '#7f7f7f');
                seg.style.backgroundColor = color;
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

    bindGlobalInteractions() {
        // --- 1. 处理 Checkbox 勾选 ---
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

        // --- 2. 处理颜色选择器 ---
        // 👑 改造：让隐藏的 color input 随时跟着鼠标走，实现“原地弹出”
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.style.position = 'absolute';
        colorInput.style.opacity = '0'; // 看不见但占位置
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
                    
                    // 👑 把输入框挪到点击的位置再触发
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

        // --- 3. 拖拽核心系统 (Drag & Drop) ---
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
                    // 如果拖拽的是小类，全局地图区域和列表区高亮提示“可释放升维”
                    document.body.classList.add('drag-active-pull-out-global');
                } else {
                    // 如果拖拽的是大类，高亮 OTHER 和 加权条
                    const otherRow = document.getElementById('other-row');
                    if(otherRow) otherRow.classList.add('drag-active-drop-in');
                    if(weightBar) weightBar.classList.add('drag-over');
                }
            }
        });

        // 👑 自动滚动逻辑 (Auto-Scroll)
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            
            // 计算鼠标相对于滚动容器(right-panel)上下的距离
            const rightPanel = document.querySelector('.right-panel');
            if(!rightPanel) return;
            
            const rect = rightPanel.getBoundingClientRect();
            const topDist = e.clientY - rect.top;
            const bottomDist = rect.bottom - e.clientY;
            
            const edgeThreshold = 60; // 距离边缘 60px 开始滚动

            if (autoScrollInterval) clearInterval(autoScrollInterval);

            if (topDist < edgeThreshold) {
                // 向上滚
                autoScrollInterval = setInterval(() => { rightPanel.scrollTop -= 10; }, 20);
            } else if (bottomDist < edgeThreshold) {
                // 向下滚
                autoScrollInterval = setInterval(() => { rightPanel.scrollTop += 10; }, 20);
            }
        });

        document.body.addEventListener('dragend', () => {
            if (autoScrollInterval) clearInterval(autoScrollInterval);
            document.body.classList.remove('drag-active-pull-out-global');
            
            const otherRow = document.getElementById('other-row');
            if(otherRow) otherRow.classList.remove('drag-active-drop-in');
            if(weightBar) weightBar.classList.remove('drag-over');
        });

        // 👑 全局释放监听 (document.body)
        document.body.addEventListener('dragover', (e) => { e.preventDefault(); });

        document.body.addEventListener('drop', (e) => {
            e.preventDefault();
            if (autoScrollInterval) clearInterval(autoScrollInterval);
            document.body.classList.remove('drag-active-pull-out-global');
            
            const type = e.dataTransfer.getData('text/plain');
            if (!type) return;

            const isSubItem = e.dataTransfer.getData('is-sub-item') === 'true';

            // 1. 如果是从 OTHER 拖出的小类
            if (isSubItem) {
                // 只要释放点不是在 OTHER 内部，全部视为升维
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
            // 2. 如果是本来就在外面的大类
            else {
                // 情况A：释放到 OTHER 行里 -> 降维
                if (e.target.closest('#other-row')) {
                    State.demoteToOther(type);
                } 
                // 情况B：释放到 Weight Bar 里 -> 恢复勾选并可能需要增加权重（原逻辑保留）
                else if (e.target.closest('#weight-bar')) {
                    const cb = document.querySelector(`.crime-checkbox[value="${type}"]`);
                    if (cb && !cb.checked) {
                        cb.checked = true;
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