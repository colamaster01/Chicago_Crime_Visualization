export const ChartRenderer = {
    
    // 画画的逻辑完全不用变
    drawSparkline(containerId, dataMap, minKey, maxKey, currentRange) {
        const container = d3.select(`#${containerId}`);
        container.selectAll("*").remove(); 

        const node = container.node();
        if (!node) return;

        const width = node.clientWidth;
        const height = 40; 

        const svg = container.append('svg')
            .attr('width', '100%')
            .attr('height', '100%');

        const domain = d3.range(minKey, maxKey + 1);
        // 【关键】：这里直接读取 API 传过来的 Map 字典里的数值
        const data = domain.map(k => ({ key: k, value: dataMap.get(k) || 0 }));

        const x = d3.scaleBand().domain(domain).range([0, width]).padding(0.2); 
        const maxVal = d3.max(data, d => d.value) || 1; 
        const y = d3.scaleLinear().domain([0, maxVal]).range([height, 0]); 

        svg.selectAll('.chart-bar')
           .data(data)
           .enter().append('rect')
           .attr('class', d => {
               const isActive = d.key >= currentRange[0] && d.key <= currentRange[1];
               return isActive ? 'chart-bar active' : 'chart-bar';
           })
           .attr('x', d => x(d.key))
           .attr('y', d => y(d.value))
           .attr('width', x.bandwidth())
           .attr('height', d => height - y(d.value))
           .attr('rx', 2); 
    },

    // 【修改点】：直接接收 API 的 histData 字典，不再接收 microData
    updateAllHistograms(histData, currentFilters) {
        if (!histData) return;

        // 直接分配给对应的画布去画图
        this.drawSparkline('year-chart', histData.year, 2001, 2026, currentFilters.year);
        this.drawSparkline('month-chart', histData.month, 1, 12, currentFilters.month);
        this.drawSparkline('hour-chart', histData.hour, 0, 24, currentFilters.hour);
    }
};