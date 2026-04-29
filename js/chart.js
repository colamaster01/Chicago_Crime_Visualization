import { State } from './state.js'; 

export const ChartRenderer = {
    // 【防崩溃核心1】：建立缓存注册表，图表只画一次，后续只更新高度！
    charts: {}, 

    drawBrushChart(containerId, filterKey, dataMap, minKey, maxKey, currentFilters) {
        const container = d3.select(`#${containerId}`);
        const node = container.node();
        if (!node) return;

        // 1. 数据对齐与最大值计算
        const domainArr = d3.range(minKey, maxKey + 1);
        const data = domainArr.map(k => ({ key: k, value: dataMap.get(k) || 0 }));
        const maxY = d3.max(data, d => d.value) || 1;

        // ==========================================
        // 2. 初始化阶段 (每个画布只在第一次加载时执行)
        // ==========================================
        if (!this.charts[containerId]) {
            const margin = {top: 5, right: 10, bottom: 20, left: 10};
            const width = node.clientWidth - margin.left - margin.right;
            const height = node.clientHeight - margin.top - margin.bottom;

            const svg = container.append('svg')
                .attr('width', node.clientWidth)
                .attr('height', node.clientHeight)
                .append('g')
                .attr('transform', `translate(${margin.left},${margin.top})`);

            const x = d3.scaleLinear().domain([minKey, maxKey]).range([0, width]);
            const y = d3.scaleLinear().domain([0, maxY]).range([height, 0]);

            const barWidth = Math.max(2, (width / (maxKey - minKey)) - 2); 

            // 画出蓝色的数据柱
            const bars = svg.selectAll('.bar')
                .data(data)
                .enter().append('rect')
                .attr('class', 'bar')
                .attr('x', d => x(d.key) - barWidth/2)
                .attr('y', d => y(d.value))
                .attr('width', barWidth)
                .attr('height', d => height - y(d.value))
                .attr('fill', '#3ca0eb')
                .attr('rx', 1);

            // 画底部的 X 坐标轴
            svg.append('g')
                .attr('class', 'axis-x')
                .attr('transform', `translate(0,${height})`)
                .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d")))
                .style("color", "#64748b"); 

            // 【核心魔法】：添加 D3 画刷
            const brush = d3.brushX()
                .extent([[0, 0], [width, height]]) 
                // 同时监听拖拽中 (brush) 和 松手 (end)
                .on('brush end', (event) => {
                    // 【防崩溃核心2】：如果事件不是真实用户的鼠标/触摸触发的（比如代码触发的），直接忽略！彻底阻断死循环。
                    if (!event.sourceEvent) return;

                    let selectedRange;
                    if (!event.selection) {
                        // 如果用户单击了空白处，意为“重置/全选”
                        selectedRange = [minKey, maxKey];
                        // 异步将画刷弹回全屏状态
                        setTimeout(() => brushGroup.call(brush.move, [0, width]), 0);
                    } else {
                        // 将像素换算为年份/月份
                        const [x0, x1] = event.selection.map(x.invert);
                        selectedRange = [Math.round(x0), Math.round(x1)];
                        if (selectedRange[0] === selectedRange[1]) return; 
                    }

                    // 拖动时：实时更新上面的文字标签
                    d3.select(`#${filterKey}-label`).text(`${selectedRange[0]} - ${selectedRange[1]}`);

                    // 只有在真正松开鼠标 (end) 时，才去骚扰 State 大脑和渲染地图，保证极度丝滑
                    if (event.type === 'end') {
                        State.updateFilter(filterKey, selectedRange);
                    }
                });

            const brushGroup = svg.append('g')
                .attr('class', 'brush')
                .call(brush);

            // 【满足你的需求】：一开始，让画刷默认“全选”整个范围
            brushGroup.call(brush.move, [0, width]);

            // 将图表的重要零件存入缓存，下次更新直接调用
            this.charts[containerId] = { y, height, bars };
        } 
        
        // ==========================================
        // 3. 更新阶段 (当 Crossfilter 数据变动时执行)
        // ==========================================
        else {
            const chart = this.charts[containerId];
            
            // 动态更新 Y 轴的最大高度比例尺
            chart.y.domain([0, maxY]);

            // 【注入灵魂】：让柱子像水一样带有弹性的过渡动画 (Transition)
            chart.bars.data(data)
                .transition()
                .duration(250) // 250毫秒的丝滑升降动画
                .attr('y', d => chart.y(d.value))
                .attr('height', d => chart.height - chart.y(d.value));
        }
    },

    updateAllHistograms(histData, currentFilters) {
        if (!histData) return;
        this.drawBrushChart('year-chart', 'year', histData.year, 2020, 2026, currentFilters);
        this.drawBrushChart('month-chart', 'month', histData.month, 1, 12, currentFilters);
        this.drawBrushChart('hour-chart', 'hour', histData.hour, 0, 24, currentFilters);
    }
};