import { MapRenderer } from './map.js';
import { UI } from './ui.js';
import { State } from './state.js';
import { API } from './api.js';
import { ChartRenderer } from './chart.js'; 
import { SankeyPanel } from './sankey.js';

// 👑 新增：使用 D3.js 驱动右侧列表的 排序洗牌、长短伸缩、以及数字滚动动画
function updateCrimeCountsD3(typeCounts) {
    if (!typeCounts) return;

    // 1. 组装数据并排序
    const data = [];
    const items = document.querySelectorAll('.merged-legend-item[data-type]');
    items.forEach(item => {
        const type = item.dataset.type;
        const count = typeCounts[type] || 0;
        data.push({ type, count });
    });

    // 按数量降序排列，如果数量相同则按字母顺序（防抖动）
    data.sort((a, b) => {
        const diff = b.count - a.count;
        return diff !== 0 ? diff : a.type.localeCompare(b.type);
    });

    // 2. 建立 D3 比例尺
    const maxCount = d3.max(data, d => d.count) || 1;
    const widthScale = d3.scaleLinear().domain([0, maxCount]).range([0, 100]);

    // 固定高度计算（SelectAll占45px，每个条目占44px）
    const ITEM_HEIGHT = 44;
    const TOP_OFFSET = 45; 

    // 3. D3 Data Join (通过 data-type 绑定)
    const sel = d3.select('#checkbox-list-container')
        .selectAll('.merged-legend-item[data-type]')
        .data(data, function(d) { return d ? d.type : this.getAttribute('data-type'); });

    // 🚀 D3 动画 1：Y轴物理位移，实现平滑的“洗牌”重排排序
    sel.transition()
       .duration(800)
       .ease(d3.easeCubicOut)
       .style('transform', (d, i) => `translateY(${TOP_OFFSET + i * ITEM_HEIGHT}px)`);

    // 🚀 D3 动画 2：进度条 Width 伸缩
    sel.select('.legend-count-fill')
       .transition()
       .duration(800)
       .ease(d3.easeCubicOut)
       .style('width', d => `${widthScale(d.count)}%`);

    // 🚀 D3 动画 3：数字平滑滚动补间 (Number Tweening)
    sel.select('.legend-count-num')
       .transition()
       .duration(800)
       .ease(d3.easeCubicOut)
       .textTween(function(d) {
           let currentText = this.textContent.replace(/,/g, '');
           let currentVal = parseInt(currentText);
           if (isNaN(currentVal)) currentVal = 0;
           
           const i = d3.interpolateRound(currentVal, d.count);
           return function(t) { return i(t).toLocaleString(); };
       });
}

document.addEventListener('DOMContentLoaded', async () => { 
    console.log("Main activating");
    
    const loaderText = document.getElementById('loader-text');
    
    try {
        await API.init(); 
        
        if(loaderText) loaderText.innerText = "Rendering map and charts...";

        UI.init();

        MapRenderer.init(() => {
            State.subscribe(async (filters, bounds, source) => {
                
                const currentZoom = window.myMap ? window.myMap.getZoom() : 0;

                if (source === 'bounds') {
                    const microData = await API.fetchCrimes(filters, bounds, currentZoom);
                    MapRenderer.updateMicroData(microData);
                } 
                else {
                    const [microData, macroData, histData] = await Promise.all([
                        API.fetchCrimes(filters, bounds, currentZoom),
                        API.fetchMacroLayer(filters),
                        API.fetchHistograms(filters) 
                    ]);
                    
                    MapRenderer.updateMicroData(microData);
                    if (macroData) MapRenderer.updateMacroData(macroData);
                    ChartRenderer.updateAllHistograms(histData, filters);
                    
                    // 👑 触发 D3 硬件级动画引擎
                    updateCrimeCountsD3(histData.typeCounts);
                    
                    if (SankeyPanel.isOpen) {
                        SankeyPanel.update(filters);
                    }
                }
            });

            window.myMap.on('moveend', () => {
                State.updateBounds(window.myMap.getBounds());
            });
            
            SankeyPanel.init();

            MapRenderer.onCommunityClick = (areaId, communityName) => {
                const filters = State.filters; 
                SankeyPanel.open(areaId, communityName, filters);
            };
            
            State.mapBounds = window.myMap.getBounds(); 
            State.notify('init'); 
            
            const loader = document.getElementById('global-loader');
            if (loader) {
                loader.style.opacity = '0';
                setTimeout(() => loader.remove(), 500);
            }
        });
    } catch (error) {
        if(loaderText) loaderText.innerText = "Error loading data. Please refresh.";
        console.error(error);
    }
});