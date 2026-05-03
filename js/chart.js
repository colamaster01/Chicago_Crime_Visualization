import { State } from './state.js'; 

const formatters = {
    year: v => Math.round(v),
    month: v => {
        let mIdx = Math.floor(v);
        if (mIdx > 12) { mIdx = 12; v = 12.999; }
        if (mIdx < 1) mIdx = 1;
        const m = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        const day = Math.floor((v - mIdx) * 31) + 1;
        const safeDay = Math.min(day, 31);
        return `${m[mIdx]} ${String(safeDay).padStart(2,'0')}`;
    },
    time: v => {
        let h = Math.floor(v);
        let m = Math.round((v - h) * 60);
        if (m === 60) { h += 1; m = 0; }
        if (h >= 24) { h = 24; m = 0; }
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    }
};

export const ChartRenderer = {
    charts: {}, 

    drawBrushChart(containerId, filterKey, dataMap, minKey, maxKey, step, currentFilters) {
        const container = d3.select(`#${containerId}`);
        const node = container.node();
        if (!node) return;

        const domainMax = (filterKey === 'time') ? maxKey : maxKey + step;
        const domainArr = d3.range(minKey, domainMax, step);
        const data = domainArr.map(k => ({ key: k, value: dataMap.get(k) || 0 }));
        const maxY = d3.max(data, d => d.value) || 1;

        if (!this.charts[containerId]) {
            const margin = {top: 5, right: 10, bottom: 20, left: 10};
            const width = node.clientWidth - margin.left - margin.right;
            const height = node.clientHeight - margin.top - margin.bottom;

            const svg = container.append('svg')
                .attr('width', node.clientWidth)
                .attr('height', node.clientHeight)
                .append('g')
                .attr('transform', `translate(${margin.left},${margin.top})`);

            const x = d3.scaleLinear().domain([minKey, domainMax]).range([0, width]);
            const y = d3.scaleLinear().domain([0, maxY]).range([height, 0]);

            const stepPx = x(minKey + step) - x(minKey);
            const barWidth = Math.max(1, stepPx - 1); 

            const bars = svg.selectAll('.bar')
                .data(data)
                .enter().append('rect')
                .attr('class', 'bar')
                .attr('x', d => x(d.key)) 
                .attr('y', d => y(d.value))
                .attr('width', barWidth)
                .attr('height', d => height - y(d.value))
                .attr('fill', '#3ca0eb')
                .attr('rx', 1);

            let xAxis = d3.axisBottom(x);
            if (filterKey === 'time') {
                xAxis.tickValues(d3.range(0, 25, 3)).tickFormat(d => `${d}:00`);
            } else if (filterKey === 'month') {
                xAxis.tickValues(d3.range(1, 14, 1)).tickFormat(d => {
                    if (d === 13) return ""; 
                    const m = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
                    return m[d] || "";
                });
            } else {
                xAxis.tickValues(d3.range(minKey, domainMax + 1, 1)).tickFormat(d3.format("d"));
            }

            svg.append('g')
                .attr('class', 'axis-x')
                .attr('transform', `translate(0,${height})`)
                .call(xAxis)
                .style("color", "#64748b"); 

            const brush = d3.brushX()
                .extent([[0, 0], [width, height]]) 
                .on('brush end', function(event) {
                    if (!event.sourceEvent) return;

                    let selectedRange;
                    if (!event.selection) {
                        selectedRange = [minKey, domainMax];
                        d3.select(this).transition().call(brush.move, [x(minKey), x(domainMax)]);
                    } else {
                        let [x0, x1] = event.selection.map(x.invert);
                        
                        if (filterKey === 'year') {
                            x0 = Math.round(x0);
                            x1 = Math.round(x1);
                            if (x0 === x1) x1 = x0 + 1; 
                            if (x1 > domainMax) x1 = domainMax;
                            
                            if (event.type === 'end') {
                                d3.select(this).transition().call(brush.move, [x(x0), x(x1)]);
                            }
                        } else {
                            if (x1 > domainMax) x1 = domainMax;
                        }
                        
                        selectedRange = [x0, x1];
                    }

                    let labelText = `${formatters[filterKey](selectedRange[0])} - ${formatters[filterKey](selectedRange[1])}`;
                    
                    if (filterKey === 'year') {
                        const startY = Math.round(selectedRange[0]);
                        const endY = Math.round(selectedRange[1]) - 1; 
                        labelText = startY === endY ? `${startY}` : `${startY} - ${endY}`;
                    } else if (filterKey === 'month') {
                        if (selectedRange[0] <= 1 && selectedRange[1] >= 13) {
                            labelText = "JAN 01 - DEC 31"; 
                        }
                    }

                    d3.select(`#${filterKey}-label`).text(labelText);

                    if (event.type === 'end') {
                        State.updateFilter(filterKey, selectedRange);
                    }
                });

            const brushGroup = svg.append('g')
                .attr('class', 'brush')
                .call(brush);

            brushGroup.call(brush.move, [0, width]);

            this.charts[containerId] = { y, height, bars };
        } 
        else {
            const chart = this.charts[containerId];
            chart.y.domain([0, maxY]);
            chart.bars.data(data)
                .transition()
                .duration(250) 
                .attr('y', d => chart.y(d.value))
                .attr('height', d => chart.height - chart.y(d.value));
        }
    },

    updateAllHistograms(histData, currentFilters) {
        if (!histData) return;
        this.drawBrushChart('year-chart', 'year', histData.year, 2020, 2026, 1, currentFilters);
        this.drawBrushChart('month-chart', 'month', histData.month, 1, 12, 1, currentFilters);
        this.drawBrushChart('time-chart', 'time', histData.time, 0, 24, 1, currentFilters); 
    }
};