export const ChartRenderer = {
    
    // 纯原生 JS 绘制柱状图，脱离 D3 依赖！
    drawSparkline(containerId, dataMap, minKey, maxKey, currentRange) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // 1. 清空旧画布
        container.innerHTML = '';

        // 2. 补全数据并找到最大值 (代替 d3.max 和 d3.scaleLinear)
        const data = [];
        let maxVal = 1;
        for (let k = minKey; k <= maxKey; k++) {
            const val = dataMap.get(k) || 0;
            data.push({ key: k, value: val });
            if (val > maxVal) maxVal = val;
        }

        // 3. 用纯 DOM 创建 Flexbox 容器
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'flex-end'; // 让柱子从底部对齐
        wrapper.style.height = '100%';
        wrapper.style.width = '100%';
        wrapper.style.gap = '2px'; // 代替 D3 的 padding(0.05)，控制柱子间隙

        // 4. 循环生成每一根柱子
        data.forEach(d => {
            const bar = document.createElement('div');
            
            // 计算高度百分比
            const heightPct = (d.value / maxVal) * 100;
            const isActive = d.key >= currentRange[0] && d.key <= currentRange[1];
            
            // 赋予原来的 CSS 类名
            bar.className = isActive ? 'chart-bar active' : 'chart-bar';
            
            // 写入内联动态样式
            bar.style.height = `${heightPct}%`;
            bar.style.flex = '1'; // 均分宽度
            bar.style.borderTopLeftRadius = '2px';
            bar.style.borderTopRightRadius = '2px';

            wrapper.appendChild(bar);
        });

        container.appendChild(wrapper);
    },

    updateAllHistograms(histData, currentFilters) {
        if (!histData) return;
        this.drawSparkline('year-chart', histData.year, 2020, 2026, currentFilters.year);
        this.drawSparkline('month-chart', histData.month, 1, 12, currentFilters.month);
        this.drawSparkline('hour-chart', histData.hour, 0, 24, currentFilters.hour);
    }
};