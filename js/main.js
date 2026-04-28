import { MapRenderer } from './map.js';
import { UI } from './ui.js';
import { State } from './state.js';
import { API } from './api.js';
import { ChartRenderer } from './chart.js'; 

document.addEventListener('DOMContentLoaded', () => {
    console.log("Main activating");
    UI.init();

    MapRenderer.init(() => {
        
        State.subscribe(async (filters, bounds, source) => {
            
            // 场景 1：用户只是平移/缩放了地图
            if (source === 'bounds') {
                console.log("🌍 视野移动：仅刷新微观散点数据...");
                const microData = await API.fetchCrimes(filters, bounds);
                MapRenderer.updateMicroData(microData);
                // 【注意】：此处没有任何图表更新逻辑，保证地图极速响应！
            } 
            // 场景 2：用户拖动了滑块或者点击了复选框
            else {
                console.log("🎛️ 条件改变：同时刷新宏观、微观与柱状图数据...");
                
                // 并发请求三个维度的数据，互不干涉
                const [microData, macroData, histData] = await Promise.all([
                    API.fetchCrimes(filters, bounds),
                    API.fetchMacroLayer(filters),
                    API.fetchHistograms(filters) // 【新增】：请求全局直方图
                ]);
                
                MapRenderer.updateMicroData(microData);
                if (macroData) MapRenderer.updateMacroData(macroData);
                
                // 将全局直方图数据交给 D3 画师
                ChartRenderer.updateAllHistograms(histData, filters);
            }
        });

        window.myMap.on('moveend', () => {
            State.updateBounds(window.myMap.getBounds());
        });
        
        State.mapBounds = window.myMap.getBounds(); 
        State.notify('init'); 
    });
});