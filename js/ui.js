import { State } from './state.js';

export const UI = {
    init() {
        this.bindDualSliders();
        this.bindCheckboxes();
        console.log("UI intializing");
    },

    bindDualSliders() {
        // 【新增】：月份英文缩写字典（索引 0 是空的，1-12 刚好对应真实的月份）
        const monthNames = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

        // 定义滑块的极值和格式化规则
        const sliders = [
            { id: 'year', min: 2020, max: 2026, format: (v) => v },
            // 【修改点】：利用字典，把传进来的数字 v 翻译成对应的英文字符串
            { id: 'month', min: 1, max: 12, format: (v) => monthNames[v] },
            { id: 'hour', min: 0, max: 24, format: (v) => `${v}:00` }
        ];

        sliders.forEach(s => {
            const minEl = document.getElementById(`${s.id}-min`);
            const maxEl = document.getElementById(`${s.id}-max`);
            const fillEl = document.getElementById(`${s.id}-fill`);
            const labelEl = document.getElementById(`${s.id}-label`);
            const ticksEl = document.getElementById(`${s.id}-ticks`);

            if (!minEl || !maxEl) return;

            // 1. 动态生成刻度 (Ticks)
            const intervalCount = s.max - s.min;
            for (let i = 0; i <= intervalCount; i++) {
                const tick = document.createElement('div');
                tick.className = 'slider-tick';
                ticksEl.appendChild(tick);
            }

            // 2. 更新视图：防交叉计算 & 进度条着色
            const updateVisuals = () => {
                let minVal = parseInt(minEl.value);
                let maxVal = parseInt(maxEl.value);

                // 防止两个滑块越界错位
                if (minVal > maxVal) {
                    if (document.activeElement === minEl) {
                        minEl.value = maxVal; minVal = maxVal;
                    } else {
                        maxEl.value = minVal; maxVal = minVal;
                    }
                }

                // 计算百分比以绘制两点之间的红色线条
                const minPct = ((minVal - s.min) / (s.max - s.min)) * 100;
                const maxPct = ((maxVal - s.min) / (s.max - s.min)) * 100;

                fillEl.style.left = minPct + '%';
                fillEl.style.width = (maxPct - minPct) + '%';

                // 更新上方的文字标签 (此时会调用上面的 format 函数)
                labelEl.textContent = `${s.format(minVal)} - ${s.format(maxVal)}`;
            };

            // 3. 报告状态给大脑
            const reportState = () => {
                State.updateFilter(s.id, [parseInt(minEl.value), parseInt(maxEl.value)]);
            };

            // 绑定事件：拖动时更新画面，松手时才请求数据
            minEl.addEventListener('input', updateVisuals);
            maxEl.addEventListener('input', updateVisuals);
            minEl.addEventListener('change', reportState);
            maxEl.addEventListener('change', reportState);

            // 初始化第一次视图
            updateVisuals();
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
            box.addEventListener('change', () => {
                if (selectAllBox) {
                    selectAllBox.checked = Array.from(checkboxes).every(cb => cb.checked);
                }
                updateState();
            });
        });
    }
};