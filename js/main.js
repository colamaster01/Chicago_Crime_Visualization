import { MapRenderer } from './map.js';
import { UI } from './ui.js';
import { State } from './state.js';
import { API } from './api.js';
import { ChartRenderer } from './chart.js'; 
import { SankeyPanel } from './sankey.js';

let currentData = [];
let currentMaxCount = 1;
let cachedWidthScale = null;

function renderSubItems(subTypeCounts) {
    const subList = document.getElementById('other-sub-list');
    if (!subList) return;
    
    // 👑 动态读取 OTHER 的当前颜色
    const otherColor = State.typeColors['OTHER'] || '#7f7f7f';
    
    let html = '';
    const subData = Object.entries(subTypeCounts)
        .map(([type, count]) => ({type, count}))
        .sort((a,b) => b.count - a.count); 
    
    subData.forEach(d => {
        const pct = currentMaxCount > 0 ? (d.count / currentMaxCount) * 100 : 0;
        // 👑 移除了 checkbox 元素，调整了布局间距
        html += `
            <div class="sub-legend-item">
                <div class="legend-item-left" style="padding-left: 22px;"> 
                    <div class="legend-color sub-legend-color" draggable="true" data-type="${d.type}" style="background:${otherColor}; width:8px; height:8px; margin-right: 12px; box-shadow:none; cursor:grab;"></div>
                    <span style="font-size:9px; color:#94a3b8; word-break: break-word;">${d.type}</span>
                </div>
                <div class="legend-count-wrap">
                    <div class="legend-count-bar" style="height: 3px;"><div class="legend-count-fill" style="background:${otherColor}; width:${pct}%;"></div></div>
                    <span class="legend-count-num" style="font-size: 10px; color:#cbd5e1;">${d.count.toLocaleString()}</span>
                </div>
            </div>
        `;
    });
    subList.innerHTML = html;
}

function layoutD3(widthScale) {
    if(widthScale) cachedWidthScale = widthScale;

    let currentY = 45; 
    const yOffsets = {};
    
    currentData.forEach(d => {
        yOffsets[d.type] = currentY;
        currentY += d.row.offsetHeight; 
    });

    document.getElementById('checkbox-list-container').style.height = `${currentY}px`;

    const sel = d3.select('#checkbox-list-container')
        .selectAll('.legend-row[data-type]')
        .data(currentData, function(d) { return d ? d.type : this.getAttribute('data-type'); });

    // D3 洗牌位移动画
    sel.transition().duration(800).ease(d3.easeCubicOut)
       .style('transform', d => `translateY(${yOffsets[d.type]}px)`);

    if(cachedWidthScale) {
        // 颜色同步更新！
        sel.select('.legend-color').style('background-color', d => State.typeColors[d.type] || '#ffffff');
        sel.select('.legend-count-fill')
           .style('background-color', d => State.typeColors[d.type] || '#ffffff')
           .transition().duration(800).ease(d3.easeCubicOut)
           .style('width', d => `${cachedWidthScale(d.count)}%`);

        sel.select('.legend-count-num')
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

// 当大类增减时，我们需要同步刷新 HTML 骨架
function ensureHTMLRowsExist(typeCounts) {
    const container = document.getElementById('checkbox-list-container');
    const existingRows = Array.from(container.querySelectorAll('.legend-row[data-type]')).map(r => r.dataset.type);
    const neededTypes = State.explicitTypes.concat(['OTHER']); 
    
    let domChanged = false;

    // 添加新的大类行
    neededTypes.forEach(type => {
        if (!existingRows.includes(type) && type !== 'OTHER') {
            const row = document.createElement('div');
            row.className = 'legend-row';
            row.dataset.type = type;
            row.style.position = 'absolute'; 
            row.style.left = '0'; row.style.right = '0'; row.style.margin = '0';
            
            const color = State.typeColors[type] || '#ffffff';
            row.innerHTML = `
                <label class="merged-legend-item">
                  <div class="legend-item-left"><input type="checkbox" class="crime-checkbox" value="${type}" checked><div class="legend-color" style="background:${color};" draggable="true" data-type="${type}"></div><span>${type}</span></div>
                  <div class="legend-count-wrap"><div class="legend-count-bar"><div class="legend-count-fill" style="background:${color};"></div></div><span class="legend-count-num">—</span></div>
                </label>
            `;
            // 插入在 OTHER 之前
            const otherRow = document.getElementById('other-row');
            container.insertBefore(row, otherRow);
            domChanged = true;
        }
    });

    // 移除不再是大类的行
    existingRows.forEach(type => {
        if (!neededTypes.includes(type) && type !== 'OTHER') {
            const row = container.querySelector(`.legend-row[data-type="${type}"]`);
            if (row) {
                row.remove();
                domChanged = true;
            }
        }
    });

    return domChanged;
}

function updateCrimeCountsD3(typeCounts, subTypeCounts) {
    if (!typeCounts) return;

    ensureHTMLRowsExist(typeCounts);

    currentData = [];
    const rows = document.querySelectorAll('.legend-row[data-type]');
    rows.forEach(row => {
        const type = row.dataset.type;
        const count = typeCounts[type] || 0;
        currentData.push({ type, count, row });
    });

    // 强制 OTHER 永远垫底
    currentData.sort((a, b) => {
        if (a.type === 'OTHER') return 1;
        if (b.type === 'OTHER') return -1;
        const diff = b.count - a.count;
        return diff !== 0 ? diff : a.type.localeCompare(b.type);
    });

    currentMaxCount = d3.max(currentData, d => d.count) || 1;
    const widthScale = d3.scaleLinear().domain([0, currentMaxCount]).range([0, 100]);

    if (subTypeCounts) {
        renderSubItems(subTypeCounts);
    }

    layoutD3(widthScale);
}

document.addEventListener('DOMContentLoaded', async () => { 
    console.log("Main activating");
    
    document.addEventListener('click', e => {
        if (e.target.closest('#other-toggle')) {
            // 👑 修复：阻断点击事件冒泡，防止触发 label 的 checkbox 状态翻转
            e.preventDefault(); 
            e.stopPropagation();

            const subList = document.getElementById('other-sub-list');
            const toggleIcon = document.getElementById('other-toggle-icon');
            if (subList.style.display === 'none') {
                subList.style.display = 'flex';
                toggleIcon.style.transform = 'rotate(90deg)';
            } else {
                subList.style.display = 'none';
                toggleIcon.style.transform = 'rotate(0deg)';
            }
            layoutD3(); 
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