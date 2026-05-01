import { MapRenderer } from './map.js';
import { UI } from './ui.js';
import { State } from './state.js';
import { API } from './api.js';
import { ChartRenderer } from './chart.js'; 
import { SankeyPanel } from './sankey.js';

let currentData = [];
let currentMaxCount = 1;
let cachedWidthScale = null;

// 👑 负责将 API 吐出的子案件动态渲染成 HTML 嵌入 OTHER 的菜单中
function renderSubItems(subTypeCounts) {
    const subList = document.getElementById('other-sub-list');
    if (!subList) return;
    
    // 子菜单勾选状态永远跟随父级 OTHER
    const otherMain = document.getElementById('other-checkbox-main');
    const otherChecked = otherMain ? otherMain.checked : true;
    
    let html = '';
    const subData = Object.entries(subTypeCounts)
        .map(([type, count]) => ({type, count}))
        .sort((a,b) => b.count - a.count); 
    
    subData.forEach(d => {
        const pct = currentMaxCount > 0 ? (d.count / currentMaxCount) * 100 : 0;
        html += `
            <div class="sub-legend-item">
                <div class="legend-item-left">
                    <input type="checkbox" disabled ${otherChecked ? 'checked' : ''} style="margin-right: 8px;">
                    <div class="legend-color" style="background:#7f7f7f; width:8px; height:8px; margin-right: 8px; box-shadow:none;"></div>
                    <span style="font-size:9px; color:#94a3b8; word-break: break-word;">${d.type}</span>
                </div>
                <div class="legend-count-wrap">
                    <div class="legend-count-bar" style="height: 3px;"><div class="legend-count-fill" style="background:#7f7f7f; width:${pct}%;"></div></div>
                    <span class="legend-count-num" style="font-size: 10px; color:#cbd5e1;">${d.count.toLocaleString()}</span>
                </div>
            </div>
        `;
    });
    subList.innerHTML = html;
}

// 👑 负责测算动态高度并执行 D3 动画
function layoutD3(widthScale) {
    if(widthScale) cachedWidthScale = widthScale;

    let currentY = 45; // 预留出顶部 Select All 按钮的高度
    const yOffsets = {};
    
    currentData.forEach(d => {
        yOffsets[d.type] = currentY;
        currentY += d.row.offsetHeight; // 高度自适应！如果 OTHER 展开了，这里会自动加上下拉菜单的高度
    });

    // 让外部包裹容器也动态变高，以便出现正常的页面滚动条
    document.getElementById('checkbox-list-container').style.height = `${currentY}px`;

    // 🚨 终极修复：正确处理未绑定数据的 DOM 元素的 Key 函数！
    const sel = d3.select('#checkbox-list-container')
        .selectAll('.legend-row[data-type]')
        .data(currentData, function(d) { 
            // 极其关键：如果是新数据返回 d.type，如果是原生标签，读取 data-type
            return d ? d.type : this.getAttribute('data-type'); 
        });

    // D3 洗牌位移动画
    sel.transition().duration(800).ease(d3.easeCubicOut)
       .style('transform', d => `translateY(${yOffsets[d.type]}px)`);

    // D3 数据条与数字动态滚动
    if(cachedWidthScale) {
         sel.select('.merged-legend-item .legend-count-fill')
           .transition().duration(800).ease(d3.easeCubicOut)
           .style('width', d => `${cachedWidthScale(d.count)}%`);

         sel.select('.merged-legend-item .legend-count-num')
           .transition().duration(800).ease(d3.easeCubicOut)
           .textTween(function(d) {
               let currentText = this.textContent.replace(/,/g, '');
               let currentVal = parseInt(currentText);
               if (isNaN(currentVal)) currentVal = 0;
               const i = d3.interpolateRound(currentVal, d.count);
               return function(t) { return i(t).toLocaleString(); };
           });
    }
}

function updateCrimeCountsD3(typeCounts, subTypeCounts) {
    if (!typeCounts) return;

    currentData = [];
    const rows = document.querySelectorAll('.legend-row[data-type]');
    rows.forEach(row => {
        const type = row.dataset.type;
        const count = typeCounts[type] || 0;
        currentData.push({ type, count, row });
    });

    currentData.sort((a, b) => {
        const diff = b.count - a.count;
        return diff !== 0 ? diff : a.type.localeCompare(b.type);
    });

    currentMaxCount = d3.max(currentData, d => d.count) || 1;
    const widthScale = d3.scaleLinear().domain([0, currentMaxCount]).range([0, 100]);

    // 渲染子案件后立刻让 D3 重新排列一切高度
    if (subTypeCounts) {
        renderSubItems(subTypeCounts);
    }

    layoutD3(widthScale);
}

document.addEventListener('DOMContentLoaded', async () => { 
    console.log("Main activating");
    
    // 👑 新增：OTHER 的下拉展开交互，点击时动态重排
    document.addEventListener('click', e => {
        if (e.target.closest('#other-toggle')) {
            const subList = document.getElementById('other-sub-list');
            const toggleIcon = document.getElementById('other-toggle-icon');
            if (subList.style.display === 'none') {
                subList.style.display = 'flex';
                toggleIcon.style.transform = 'rotate(90deg)';
            } else {
                subList.style.display = 'none';
                toggleIcon.style.transform = 'rotate(0deg)';
            }
            layoutD3(); // 强制 D3 重新计算高度重排，极其丝滑
        }
    });
    
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
                } else {
                    const [microData, macroData, histData] = await Promise.all([
                        API.fetchCrimes(filters, bounds, currentZoom),
                        API.fetchMacroLayer(filters),
                        API.fetchHistograms(filters) 
                    ]);
                    
                    MapRenderer.updateMicroData(microData);
                    if (macroData) MapRenderer.updateMacroData(macroData);
                    ChartRenderer.updateAllHistograms(histData, filters);
                    
                    // 传入额外分离出来的 subTypeCounts 用于子菜单渲染
                    updateCrimeCountsD3(histData.typeCounts, histData.subTypeCounts);
                    
                    if (SankeyPanel.isOpen) SankeyPanel.update(filters);
                }
            });

            window.myMap.on('moveend', () => State.updateBounds(window.myMap.getBounds()));
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